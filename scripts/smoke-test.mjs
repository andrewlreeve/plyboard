import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const cli = path.join(root, "bin", "plywood.mjs");

function run(args) {
  return execFileSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
}

const listOutput = run(["blueprint", "list"]);
assert.match(listOutput, /product-readiness-qa/);

const inspectOutput = run(["blueprint", "inspect"]);
assert.match(inspectOutput, /Docker SBX/);
assert.match(inspectOutput, /Secrets shared with sandbox: false/);

const contextStatusOutput = run(["context", "status"]);
assert.match(contextStatusOutput, /Default context: ready/);
assert.match(contextStatusOutput, /context/);
assert.match(contextStatusOutput, /\/plywood\/context/);

const createSandboxOutput = run(["create", "--dry-run", "--json"]);
const createSandbox = JSON.parse(createSandboxOutput);
assert.equal(createSandbox.blueprint.id, "product-readiness-qa");
assert.equal(createSandbox.agent_adapter, "codex");
assert.equal(createSandbox.runtime, "Docker SBX");
assert.equal(createSandbox.secrets_shared_with_sandbox, false);
assert.equal(createSandbox.sbx.command[0], "sbx");
assert.equal(createSandbox.sbx.command[1], "create");
assert.equal(createSandbox.sbx.command[2], "codex");
assert.equal(createSandbox.sbx.execute_attempted, false);
assert.ok(
  createSandbox.context_mounts.some(
    (mount) =>
      mount.source_path === "context" &&
      mount.sbx_workspace_arg.endsWith("/context:ro") &&
      mount.logical_sandbox_path === "/plywood/context"
  )
);
assert.ok(fs.existsSync(path.join(root, createSandbox.artifacts.spec)));
assert.ok(fs.existsSync(path.join(root, createSandbox.artifacts.create_command)));

const runSandboxOutput = run(["run", "--dry-run", "--json"]);
const runSandbox = JSON.parse(runSandboxOutput);
assert.equal(runSandbox.sandbox.name, createSandbox.name);
assert.equal(runSandbox.sandbox.blueprint.id, "product-readiness-qa");
assert.equal(runSandbox.interactive, true);
assert.equal(runSandbox.secrets_shared_with_sandbox, false);
assert.equal(runSandbox.runtime.execute_attempted, false);
assert.ok(runSandbox.next_steps.some((step) => step.includes("plywood run")));

const commandExecOutput = run(["exec", "--dry-run", "--json", "--", "npm", "test"]);
const commandExec = JSON.parse(commandExecOutput);
assert.equal(commandExec.sandbox.name, createSandbox.name);
assert.equal(commandExec.interactive, false);
assert.deepEqual(commandExec.command, ["npm", "test"]);
assert.equal(commandExec.runtime.execute_attempted, false);

const runOutput = run([
  "exec",
  "--target",
  "demo",
  "--safety-mode",
  "draft-only",
  "--context",
  "./examples/brand-context"
]);
assert.match(runOutput, /Run created:/);
assert.match(runOutput, /Policy:/);

const latestRunDir = fs.readFileSync(path.join(root, ".plywood", "latest-run"), "utf8").trim();
const manifest = JSON.parse(fs.readFileSync(path.join(root, latestRunDir, "manifest.json"), "utf8"));

assert.equal(manifest.blueprint.id, "product-readiness-qa");
assert.equal(manifest.sbx.secrets_shared_with_sandbox, false);
assert.equal(manifest.sbx.api_access.sandbox_receives_raw_credentials, false);
assert.equal(manifest.product_findings.length, 3);
assert.equal(manifest.storefront_findings.length, 1);
assert.ok(manifest.policy_summary.safe > 0);
assert.ok(manifest.policy_summary.needs_approval > 0);
assert.ok(manifest.policy_summary.blocked > 0);
assert.ok(
  manifest.sbx.mounted_context.some(
    (mount) =>
      mount.source_path === "context" &&
      mount.sandbox_path === "/plywood/context" &&
      mount.mount_role === "default"
  )
);
assert.ok(
  manifest.sbx.mounted_context.some(
    (mount) =>
      mount.source_path === "examples/brand-context" &&
      mount.sandbox_path === "/plywood/context/extra/brand-context" &&
      mount.mount_role === "extra"
  )
);

const blockedReview = run(["review", "latest", "--only", "blocked"]);
assert.match(blockedReview, /product.media_delete/);
assert.match(blockedReview, /theme.publish.production/);

const approvalOutput = run(["approve", "latest", "--action", "act-005", "--actor", "smoke-test"]);
assert.match(approvalOutput, /Approval recorded/);

let blockedApprovalFailed = false;
try {
  run(["approve", "latest", "--action", "act-009", "--actor", "smoke-test"]);
} catch (error) {
  blockedApprovalFailed = true;
  assert.match(error.stderr.toString(), /Blocked actions cannot be approved/);
}
assert.equal(blockedApprovalFailed, true);

const exportOutput = run(["export-audit", "latest", "--out", "exports/smoke"]);
assert.match(exportOutput, /Audit packet exported/);
assert.ok(fs.existsSync(path.join(root, "exports", "smoke", "audit-packet.md")));
assert.ok(fs.existsSync(path.join(root, "exports", "smoke", "approval-record.json")));

console.log("Smoke test passed.");
