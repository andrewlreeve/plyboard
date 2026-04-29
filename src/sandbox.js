import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_CONTEXT_DIR, DEFAULT_CONTEXT_SANDBOX_PATH, resolveContextMounts } from "./context.js";

const SANDBOX_ROOT = ".plywood/sandboxes";

export function createBlueprintSandbox({ blueprint, paths, flags, workspaceRoot }) {
  const agentAdapter = blueprint.runtime.agentAdapter;
  if (!agentAdapter) {
    throw new Error(`Blueprint "${blueprint.id}" does not define runtime.agentAdapter.`);
  }

  const name = String(flags.name || defaultSandboxName(blueprint));
  const workspaceArgs = normalizeWorkspaceArgs(paths.length > 0 ? paths : ["."], workspaceRoot);
  const includeDefault = flags["no-default-context"] !== true && flags["no-default-context"] !== "true";
  const extraContextInputs = normalizeRepeatedFlag(flags.context);
  const contextMounts = resolveContextMounts(extraContextInputs, workspaceRoot, { includeDefault });
  const contextWorkspaceArgs = contextMounts.map((mount) => `${mount.absolute_path}:ro`);
  const sbxArgs = ["create", agentAdapter, ...workspaceArgs, ...contextWorkspaceArgs];

  sbxArgs.push("--name", name);
  addForwardedValueFlag(sbxArgs, flags, "branch", "--branch");
  addForwardedValueFlag(sbxArgs, flags, "memory", "--memory");
  addForwardedValueFlag(sbxArgs, flags, "cpus", "--cpus");
  addForwardedValueFlag(sbxArgs, flags, "template", "--template");
  addForwardedBooleanFlag(sbxArgs, flags, "quiet", "--quiet");
  addForwardedBooleanFlag(sbxArgs, flags, "debug", "--debug");

  const command = ["sbx", ...sbxArgs];
  const sandboxDir = path.join(workspaceRoot, SANDBOX_ROOT, name);
  fs.mkdirSync(sandboxDir, { recursive: true });
  const specPath = path.join(sandboxDir, "sandbox.json");
  const commandPath = path.join(sandboxDir, "create-command.sh");
  const artifacts = {
    sandbox_dir: path.relative(workspaceRoot, sandboxDir),
    spec: path.relative(workspaceRoot, specPath),
    create_command: path.relative(workspaceRoot, commandPath)
  };

  const dryRun = flags["dry-run"] === true || flags["dry-run"] === "true";
  const sbxAvailable = commandExists("sbx");
  const shouldExecute = !dryRun && sbxAvailable;
  const createdAt = new Date().toISOString();
  const spec = {
    schema_version: "plywood.sandbox.v1",
    id: `${name}-${crypto.randomBytes(2).toString("hex")}`,
    name,
    blueprint: {
      id: blueprint.id,
      name: blueprint.name,
      version: blueprint.version
    },
    agent_adapter: agentAdapter,
    runtime: "Docker SBX",
    created_at: createdAt,
    status: shouldExecute ? "creating" : "planned",
    workspace_root: workspaceRoot,
    secrets_shared_with_sandbox: false,
    sbx: {
      command,
      workspace_args: [...workspaceArgs, ...contextWorkspaceArgs],
      context_mount_pattern: `${DEFAULT_CONTEXT_DIR}:ro`,
      execute_attempted: false,
      available: sbxAvailable
    },
    context_mounts: contextMounts.map((mount) => ({
      source_path: mount.source_path,
      absolute_path: mount.absolute_path,
      sbx_workspace_arg: `${mount.absolute_path}:ro`,
      logical_sandbox_path: mount.sandbox_path,
      mount_role: mount.mount_role,
      readonly: true,
      sha256: mount.sha256,
      file_count: mount.file_count ?? 1
    })),
    policy: {
      default_context_auto_mounted: includeDefault,
      default_context_local_path: DEFAULT_CONTEXT_DIR,
      default_context_logical_sandbox_path: DEFAULT_CONTEXT_SANDBOX_PATH,
      api_secrets_in_sandbox: false,
      credentials_owner: "host-api-broker"
    },
    next_steps: buildCreateNextSteps(name, blueprint.id, sbxAvailable, dryRun)
  };
  spec.artifacts = artifacts;

  let execution = null;
  if (shouldExecute) {
    execution = spawnSync("sbx", sbxArgs, {
      cwd: workspaceRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
    spec.sbx.execute_attempted = true;
    spec.sbx.exit_code = execution.status;
    spec.sbx.stdout = execution.stdout;
    spec.sbx.stderr = execution.stderr;
    spec.status = execution.status === 0 ? "created" : "failed";
  } else if (!sbxAvailable) {
    spec.sbx.reason_not_executed = "Docker SBX runtime adapter is not available on PATH. Plywood wrote the creation plan instead.";
  } else {
    spec.sbx.reason_not_executed = "Dry run requested.";
  }

  fs.writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);
  fs.writeFileSync(commandPath, `#!/usr/bin/env bash\nset -euo pipefail\n${shellCommand(command)}\n`);
  fs.chmodSync(commandPath, 0o755);

  return {
    ...spec,
    artifacts
  };
}

export function runSandbox({ reference, flags, workspaceRoot }) {
  const name = normalizeSandboxReference(reference);
  const spec = loadSandboxSpec(name, workspaceRoot);
  const dryRun = flags["dry-run"] === true || flags["dry-run"] === "true";
  const sbxAvailable = commandExists("sbx");
  const command = ["sbx", "run", spec.name];
  const result = {
    schema_version: "plywood.sandbox_run.v1",
    sandbox: {
      name: spec.name,
      blueprint: spec.blueprint,
      agent_adapter: spec.agent_adapter,
      runtime: spec.runtime,
      spec: path.join(SANDBOX_ROOT, spec.name, "sandbox.json")
    },
    status: dryRun || !sbxAvailable ? "planned" : "running",
    interactive: true,
    secrets_shared_with_sandbox: false,
    context_mounts: spec.context_mounts || [],
    runtime: {
      adapter: "Docker SBX",
      available: sbxAvailable,
      execute_attempted: false,
      command
    },
    next_steps: []
  };

  if (dryRun) {
    result.runtime.reason_not_executed = "Dry run requested.";
    result.next_steps.push(`Run "plywood run ${spec.name}" to attach to this sandbox interactively.`);
    return result;
  }

  if (!sbxAvailable) {
    result.runtime.reason_not_executed = "Docker SBX runtime is not available on PATH.";
    result.next_steps.push("Install Docker SBX, then rerun this same Plywood command.");
    result.next_steps.push(`Command: plywood run ${spec.name}`);
    return result;
  }

  const execution = spawnSync("sbx", ["run", spec.name], {
    cwd: workspaceRoot,
    encoding: "utf8",
    stdio: flags.json === true || flags.json === "true" ? ["ignore", "pipe", "pipe"] : "inherit"
  });

  result.runtime.execute_attempted = true;
  result.runtime.exit_code = execution.status;
  if (flags.json === true || flags.json === "true") {
    result.runtime.stdout = execution.stdout;
    result.runtime.stderr = execution.stderr;
  }
  result.status = execution.status === 0 ? "completed" : "failed";
  return result;
}

export function execSandboxCommand({ reference, commandArgs, flags, workspaceRoot }) {
  const name = normalizeSandboxReference(reference);
  const spec = loadSandboxSpec(name, workspaceRoot);
  if (commandArgs.length === 0) {
    throw new Error('Usage: plywood exec [sandbox-name] -- <command>');
  }

  const dryRun = flags["dry-run"] === true || flags["dry-run"] === "true";
  const sbxAvailable = commandExists("sbx");
  const command = ["sbx", "exec", spec.name, ...commandArgs];
  const result = {
    schema_version: "plywood.sandbox_exec.v1",
    sandbox: {
      name: spec.name,
      blueprint: spec.blueprint,
      agent_adapter: spec.agent_adapter,
      runtime: spec.runtime,
      spec: path.join(SANDBOX_ROOT, spec.name, "sandbox.json")
    },
    status: dryRun || !sbxAvailable ? "planned" : "executing",
    interactive: false,
    command: commandArgs,
    secrets_shared_with_sandbox: false,
    runtime: {
      adapter: "Docker SBX",
      available: sbxAvailable,
      execute_attempted: false,
      command
    },
    next_steps: []
  };

  if (dryRun) {
    result.runtime.reason_not_executed = "Dry run requested.";
    result.next_steps.push(`Run "plywood exec ${spec.name} -- ${shellCommand(commandArgs)}" to execute this command.`);
    return result;
  }

  if (!sbxAvailable) {
    result.runtime.reason_not_executed = "Docker SBX runtime is not available on PATH.";
    result.next_steps.push("Install Docker SBX, then rerun this same Plywood command.");
    result.next_steps.push(`Command: plywood exec ${spec.name} -- ${shellCommand(commandArgs)}`);
    return result;
  }

  const execution = spawnSync("sbx", ["exec", spec.name, ...commandArgs], {
    cwd: workspaceRoot,
    encoding: "utf8",
    stdio: flags.json === true || flags.json === "true" ? ["ignore", "pipe", "pipe"] : "inherit"
  });

  result.runtime.execute_attempted = true;
  result.runtime.exit_code = execution.status;
  if (flags.json === true || flags.json === "true") {
    result.runtime.stdout = execution.stdout;
    result.runtime.stderr = execution.stderr;
  }
  result.status = execution.status === 0 ? "completed" : "failed";
  return result;
}

function normalizeWorkspaceArgs(paths, workspaceRoot) {
  return paths.map((input) => {
    const value = String(input);
    const readOnly = value.endsWith(":ro");
    const cleanValue = readOnly ? value.slice(0, -3) : value;
    const absolutePath = path.resolve(workspaceRoot, cleanValue);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Workspace path does not exist: ${cleanValue}`);
    }
    return `${absolutePath}${readOnly ? ":ro" : ""}`;
  });
}

function normalizeRepeatedFlag(value) {
  if (value === undefined || value === false) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function addForwardedValueFlag(args, flags, name, optionName) {
  if (flags[name] !== undefined && flags[name] !== true) {
    args.push(optionName, String(flags[name]));
  }
}

function addForwardedBooleanFlag(args, flags, name, optionName) {
  if (flags[name] === true || flags[name] === "true") {
    args.push(optionName);
  }
}

function commandExists(command) {
  const result = spawnSync("which", [command], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  });
  return result.status === 0 && result.stdout.trim().length > 0;
}

function buildCreateNextSteps(name, blueprintId, sbxAvailable, dryRun) {
  if (sbxAvailable && !dryRun) {
    return [`Run "plywood run ${name}" to attach to the sandbox interactively.`];
  }

  const createCommand = blueprintId === name ? "plywood create" : `plywood create ${blueprintId} --name ${name}`;

  return [
    `Review ${SANDBOX_ROOT}/${name}/sandbox.json.`,
    "Install Docker SBX on this machine if it is not installed.",
    `Then run "${createCommand}" and "plywood run ${name}".`
  ];
}

function loadSandboxSpec(name, workspaceRoot) {
  const specPath = path.join(workspaceRoot, SANDBOX_ROOT, name, "sandbox.json");
  if (!fs.existsSync(specPath)) {
    throw new Error(`Sandbox "${name}" was not found. Create it first with "plywood create --name ${name}".`);
  }
  return JSON.parse(fs.readFileSync(specPath, "utf8"));
}

function normalizeSandboxReference(reference) {
  return reference;
}

function defaultSandboxName(blueprint) {
  return blueprint.runtime.defaultSandboxName || safeName(blueprint.id);
}

function safeName(value) {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "workspace";
}

function shellCommand(parts) {
  return parts.map(shellQuote).join(" ");
}

function shellQuote(value) {
  if (/^[a-zA-Z0-9_./:=@+-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, "'\\''")}'`;
}
