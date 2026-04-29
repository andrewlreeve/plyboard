import fs from "node:fs";
import path from "node:path";
import { parseArgs, getRepeatedFlag, normalizeSafetyMode, normalizeTarget, isHelp, isJsonFlag } from "./args.js";
import { getDefaultBlueprintId, listBlueprints, loadBlueprint, requireBlueprint, requireDefaultBlueprint } from "./blueprint.js";
import { getContextStatus, initDefaultContext, resolveContextMounts } from "./context.js";
import { createProductReadinessRun } from "./mock-runner.js";
import { exportAudit, loadRun, recordApproval, writeRunArtifacts } from "./artifacts.js";
import { createBlueprintSandbox, execSandboxCommand, runSandbox } from "./sandbox.js";
import {
  formatApprovalResult,
  formatBlueprintInspect,
  formatBlueprintList,
  formatCreateSandboxResult,
  formatExecSandboxResult,
  formatContextInitResult,
  formatContextStatus,
  formatExportResult,
  formatHelp,
  formatReview,
  formatRunSandboxResult,
  formatRunSummary
} from "./format.js";

export async function runCli(argv, io = process) {
  const workspaceRoot = process.cwd();

  if (isHelp(argv)) {
    io.stdout.write(`${formatHelp()}\n`);
    return;
  }

  const { positionals, flags, passthrough } = parseArgs(argv);
  const [command, subcommand, maybeId, ...restPositionals] = positionals;

  if (command === "init") {
    const result = initWorkspace(workspaceRoot, flags.force === true || flags.force === "true");
    io.stdout.write(`${result}\n`);
    return;
  }

  if (command === "context") {
    handleContextCommand({ subcommand, flags, io, workspaceRoot });
    return;
  }

  if (command === "create") {
    handleCreateCommand({ requested: subcommand, paths: [maybeId, ...restPositionals].filter(Boolean), flags, io, workspaceRoot });
    return;
  }

  if (command === "run") {
    handleRunCommand({ reference: subcommand, flags, io, workspaceRoot });
    return;
  }

  if (command === "exec") {
    handleExecCommand({ reference: subcommand, commandArgs: passthrough, flags, io, workspaceRoot });
    return;
  }

  if (command === "blueprint") {
    handleBlueprintCommand({ subcommand, maybeId, flags, io });
    return;
  }

  if (command === "review") {
    const reference = subcommand || "latest";
    const only = normalizeOnly(flags.only);
    const manifest = loadRun(reference, workspaceRoot);
    const outputManifest = only
      ? {
          ...manifest,
          actions: manifest.actions.filter((action) => action.policy_result === only)
        }
      : manifest;

    if (isJsonFlag(flags)) {
      io.stdout.write(`${JSON.stringify(outputManifest, null, 2)}\n`);
    } else {
      io.stdout.write(`${formatReview(manifest, { only })}\n`);
    }
    return;
  }

  if (command === "export-audit") {
    const reference = subcommand || "latest";
    const result = exportAudit(reference, workspaceRoot, flags.out || null);
    if (isJsonFlag(flags)) {
      io.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      io.stdout.write(`${formatExportResult(result)}\n`);
    }
    return;
  }

  if (command === "approve") {
    const reference = subcommand || "latest";
    const actionIds = getRepeatedFlag(flags, "action");
    const allNeedsApproval = flags["all-needs-approval"] === true || flags["all-needs-approval"] === "true";
    if (!allNeedsApproval && actionIds.length === 0) {
      throw new Error("Usage: plyboard approve latest --action act-005 [--action act-018]");
    }

    const approval = recordApproval(reference, workspaceRoot, {
      actionIds,
      allNeedsApproval,
      actor: String(flags.actor || "demo-operator"),
      note: flags.note ? String(flags.note) : ""
    });

    if (isJsonFlag(flags)) {
      io.stdout.write(`${JSON.stringify(approval, null, 2)}\n`);
    } else {
      io.stdout.write(`${formatApprovalResult(approval)}\n`);
    }
    return;
  }

  throw new Error(`Unknown command "${command}". Run plyboard --help.`);
}

function handleRunCommand({ reference, flags, io, workspaceRoot }) {
  const sandboxReference = resolveSandboxReference(reference);
  ensureSandboxExists({ reference: sandboxReference, flags, workspaceRoot });
  const result = runSandbox({ reference: sandboxReference, flags, workspaceRoot });
  if (isJsonFlag(flags)) {
    io.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    io.stdout.write(`${formatRunSandboxResult(result)}\n`);
  }

  if (result.runtime.execute_attempted && result.runtime.exit_code !== 0) {
    process.exitCode = result.runtime.exit_code || 1;
  }
}

function handleExecCommand({ reference, commandArgs, flags, io, workspaceRoot }) {
  if (commandArgs.length > 0) {
    const sandboxReference = reference || getDefaultBlueprintId();
    ensureSandboxExists({ reference: sandboxReference, flags, workspaceRoot });
    const result = execSandboxCommand({ reference: sandboxReference, commandArgs, flags, workspaceRoot });
    if (isJsonFlag(flags)) {
      io.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      io.stdout.write(`${formatExecSandboxResult(result)}\n`);
    }

    if (result.runtime.execute_attempted && result.runtime.exit_code !== 0) {
      process.exitCode = result.runtime.exit_code || 1;
    }
    return;
  }

  const blueprintId = reference || getDefaultBlueprintId();
  const blueprint = requireBlueprint(blueprintId);
  if (blueprint.id !== "product-readiness-qa") {
    throw new Error(`No workflow executor implemented yet for blueprint "${blueprint.id}".`);
  }

  const targetEnvironment = normalizeTarget(flags.target || "demo");
  const safetyMode = normalizeSafetyMode(flags["safety-mode"] || "draft-only");
  const includeDefault = flags["no-default-context"] !== true && flags["no-default-context"] !== "true";
  const contextMounts = resolveContextMounts(getRepeatedFlag(flags, "context"), workspaceRoot, {
    includeDefault
  });
  const manifest = createProductReadinessRun({
    blueprint,
    targetEnvironment,
    safetyMode,
    contextMounts
  });
  const written = writeRunArtifacts(manifest, workspaceRoot);

  if (isJsonFlag(flags)) {
    io.stdout.write(`${JSON.stringify(written.manifest, null, 2)}\n`);
  } else {
    io.stdout.write(`${formatRunSummary(written.manifest)}\n`);
  }
}

function ensureSandboxExists({ reference, flags, workspaceRoot }) {
  const name = reference || getDefaultBlueprintId();
  const specPath = path.join(workspaceRoot, ".plyboard", "sandboxes", name, "sandbox.json");
  if (fs.existsSync(specPath)) {
    return;
  }

  const blueprint = requireBlueprint(reference || getDefaultBlueprintId());
  createBlueprintSandbox({
    blueprint,
    paths: [],
    flags,
    workspaceRoot
  });
}

function resolveSandboxReference(reference) {
  return reference || getDefaultBlueprintId();
}

function handleCreateCommand({ requested, paths, flags, io, workspaceRoot }) {
  const resolved = resolveCreateBlueprintAndPaths({ requested, paths, workspaceRoot });
  const result = createBlueprintSandbox({
    blueprint: resolved.blueprint,
    paths: resolved.paths,
    flags,
    workspaceRoot
  });
  io.stdout.write(isJsonFlag(flags) ? `${JSON.stringify(result, null, 2)}\n` : `${formatCreateSandboxResult(result)}\n`);
  if (result.sbx.execute_attempted && result.sbx.exit_code !== 0) {
    process.exitCode = result.sbx.exit_code || 1;
  }
}

function resolveCreateBlueprintAndPaths({ requested, paths, workspaceRoot }) {
  if (!requested) {
    return {
      blueprint: requireDefaultBlueprint(),
      paths
    };
  }

  const blueprint = loadBlueprint(requested);
  if (blueprint) {
    return {
      blueprint,
      paths
    };
  }

  const requestedPath = path.resolve(workspaceRoot, requested);
  if (fs.existsSync(requestedPath)) {
    return {
      blueprint: requireDefaultBlueprint(),
      paths: [requested, ...paths]
    };
  }

  throw new Error(`Unknown blueprint or workspace path "${requested}".`);
}

function handleContextCommand({ subcommand, flags, io, workspaceRoot }) {
  if (subcommand === "init") {
    const result = initDefaultContext(workspaceRoot, {
      force: flags.force === true || flags.force === "true"
    });
    io.stdout.write(isJsonFlag(flags) ? `${JSON.stringify(result, null, 2)}\n` : `${formatContextInitResult(result)}\n`);
    return;
  }

  if (subcommand === "status") {
    const status = getContextStatus(workspaceRoot);
    io.stdout.write(isJsonFlag(flags) ? `${JSON.stringify(status, null, 2)}\n` : `${formatContextStatus(status)}\n`);
    return;
  }

  throw new Error("Usage: plyboard context init | plyboard context status");
}

function handleBlueprintCommand({ subcommand, maybeId, flags, io }) {
  if (subcommand === "list") {
    const blueprints = listBlueprints();
    io.stdout.write(
      isJsonFlag(flags) ? `${JSON.stringify(blueprints, null, 2)}\n` : `${formatBlueprintList(blueprints)}\n`
    );
    return;
  }

  if (subcommand === "inspect") {
    const blueprint = maybeId ? requireBlueprint(maybeId) : requireDefaultBlueprint();
    io.stdout.write(
      isJsonFlag(flags) ? `${JSON.stringify(blueprint, null, 2)}\n` : `${formatBlueprintInspect(blueprint)}\n`
    );
    return;
  }

  throw new Error("Usage: plyboard blueprint list | plyboard blueprint inspect [blueprint-id]");
}

function initWorkspace(workspaceRoot, force) {
  const plyboardDir = path.join(workspaceRoot, ".plyboard");
  const configPath = path.join(plyboardDir, "config.json");

  fs.mkdirSync(plyboardDir, { recursive: true });
  fs.mkdirSync(path.join(workspaceRoot, "runs"), { recursive: true });

  if (fs.existsSync(configPath) && !force) {
    return "Plyboard workspace already initialized.";
  }

  const config = {
    version: 1,
    default_blueprint: getDefaultBlueprintId(),
    default_target: "demo",
    default_safety_mode: "draft-only",
    default_context: {
      local_path: "context",
      sandbox_path: "/plyboard/context",
      readonly: true,
      auto_mount: true
    },
    secrets_policy: {
      standard: "SBX",
      secrets_shared_with_sandbox: false,
      credential_owner: "host-api-broker"
    }
  };

  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  return `Plyboard workspace initialized at ${path.relative(workspaceRoot, plyboardDir) || ".plyboard"}.`;
}

function normalizeOnly(value) {
  if (value === undefined) {
    return null;
  }
  const normalized = String(value).trim();
  if (!["safe", "needs_approval", "blocked"].includes(normalized)) {
    throw new Error("Use --only safe, --only needs_approval, or --only blocked.");
  }
  return normalized;
}
