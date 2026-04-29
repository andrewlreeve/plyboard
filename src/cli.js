import fs from "node:fs";
import path from "node:path";
import { parseArgs, getRepeatedFlag, normalizeSafetyMode, normalizeTarget, isHelp, isJsonFlag } from "./args.js";
import { listBlueprints, requireBlueprint } from "./blueprints.js";
import { resolveContextMounts } from "./context.js";
import { createProductReadinessRun } from "./mock-runner.js";
import { exportAudit, loadRun, recordApproval, writeRunArtifacts } from "./artifacts.js";
import {
  formatApprovalResult,
  formatBlueprintInspect,
  formatBlueprintList,
  formatExportResult,
  formatHelp,
  formatReview,
  formatRunSummary
} from "./format.js";

export async function runCli(argv, io = process) {
  const workspaceRoot = process.cwd();

  if (isHelp(argv)) {
    io.stdout.write(`${formatHelp()}\n`);
    return;
  }

  const { positionals, flags } = parseArgs(argv);
  const [command, subcommand, maybeId] = positionals;

  if (command === "init") {
    const result = initWorkspace(workspaceRoot, flags.force === true || flags.force === "true");
    io.stdout.write(`${result}\n`);
    return;
  }

  if (command === "blueprint") {
    handleBlueprintCommand({ subcommand, maybeId, flags, io });
    return;
  }

  if (command === "run") {
    const blueprintId = subcommand;
    if (!blueprintId) {
      throw new Error("Usage: plyboard run <blueprint-id> --target demo --safety-mode draft-only");
    }

    const blueprint = requireBlueprint(blueprintId);
    if (blueprint.id !== "product-readiness-qa") {
      throw new Error(`No runner implemented yet for blueprint "${blueprint.id}".`);
    }

    const targetEnvironment = normalizeTarget(flags.target || "demo");
    const safetyMode = normalizeSafetyMode(flags["safety-mode"] || "draft-only");
    const contextMounts = resolveContextMounts(getRepeatedFlag(flags, "context"), workspaceRoot);
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

function handleBlueprintCommand({ subcommand, maybeId, flags, io }) {
  if (subcommand === "list") {
    const blueprints = listBlueprints();
    io.stdout.write(
      isJsonFlag(flags) ? `${JSON.stringify(blueprints, null, 2)}\n` : `${formatBlueprintList(blueprints)}\n`
    );
    return;
  }

  if (subcommand === "inspect") {
    if (!maybeId) {
      throw new Error("Usage: plyboard blueprint inspect <blueprint-id>");
    }
    const blueprint = requireBlueprint(maybeId);
    io.stdout.write(
      isJsonFlag(flags) ? `${JSON.stringify(blueprint, null, 2)}\n` : `${formatBlueprintInspect(blueprint)}\n`
    );
    return;
  }

  throw new Error("Usage: plyboard blueprint list | plyboard blueprint inspect <blueprint-id>");
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
    default_blueprint: "product-readiness-qa",
    default_target: "demo",
    default_safety_mode: "draft-only",
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
