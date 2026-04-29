import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const cli = path.join(root, "bin", "plywood.mjs");

function run(args, env = {}) {
  return execFileSync(process.execPath, [cli, ...args], {
    cwd: root,
    env: {
      ...process.env,
      ...env
    },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
}

const listOutput = run(["blueprint", "list"]);
assert.match(listOutput, /default/);
assert.match(listOutput, /product-readiness-qa/);

const inspectOutput = run(["blueprint", "inspect"]);
assert.match(inspectOutput, /Docker SBX/);
assert.match(inspectOutput, /Codex Agent/);
assert.match(inspectOutput, /Secrets shared with sandbox: false/);

const productBlueprintOutput = run(["blueprint", "inspect", "product-readiness-qa"]);
assert.match(productBlueprintOutput, /Product Readiness QA Blueprint/);
assert.match(productBlueprintOutput, /Catalog QA Agent/);

const contextStatusOutput = run(["context", "status"]);
assert.match(contextStatusOutput, /Default context: ready/);
assert.match(contextStatusOutput, /context/);
assert.match(contextStatusOutput, /\/plywood\/context/);

const createSandboxOutput = run(["create", "--dry-run", "--json"]);
const createSandbox = JSON.parse(createSandboxOutput);
assert.equal(createSandbox.blueprint.id, "default");
assert.equal(createSandbox.name, "plywood-codex");
assert.equal(createSandbox.agent_adapter, "codex");
assert.equal(createSandbox.runtime, "Docker SBX");
assert.equal(createSandbox.secrets_shared_with_sandbox, false);
assert.equal(createSandbox.sbx.command[0], "sbx");
assert.equal(createSandbox.sbx.command[1], "create");
assert.deepEqual(createSandbox.sbx.command.slice(2, 5), ["--name", "plywood-codex", "codex"]);
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
assert.equal(runSandbox.sandbox.blueprint.id, "default");
assert.equal(runSandbox.interactive, true);
assert.equal(runSandbox.secrets_shared_with_sandbox, false);
assert.equal(runSandbox.runtime.runner_version, "2026-04-29-precreate-v2");
assert.equal(runSandbox.runtime.execute_attempted, false);
assert.deepEqual(runSandbox.runtime.prepare_command.slice(0, 5), [
  "sbx",
  "create",
  "--name",
  "plywood-codex",
  "codex"
]);
assert.ok(runSandbox.runtime.prepare_command.some((arg) => arg.endsWith("/context:ro")));
assert.deepEqual(runSandbox.runtime.command, ["sbx", "run", "plywood-codex"]);
assert.ok(runSandbox.next_steps.some((step) => step.includes("plywood run")));

const fakeSbxDir = fs.mkdtempSync(path.join(root, ".plywood", "fake-sbx-"));
const fakeSbxPath = path.join(fakeSbxDir, "sbx");
const fakeSbxCapturePath = path.join(fakeSbxDir, "args.txt");
fs.writeFileSync(
  fakeSbxPath,
  `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$SBX_CAPTURE"
exit 0
`
);
fs.chmodSync(fakeSbxPath, 0o755);
const fakeRunOutput = run(["run", "--json"], {
  PATH: `${fakeSbxDir}${path.delimiter}${process.env.PATH}`,
  SBX_CAPTURE: fakeSbxCapturePath
});
const fakeRun = JSON.parse(fakeRunOutput);
assert.equal(fakeRun.status, "completed");
assert.equal(fakeRun.runtime.execute_attempted, true);
assert.equal(fakeRun.runtime.prepare_attempted, true);
const fakeSbxArgs = fs.readFileSync(fakeSbxCapturePath, "utf8").trim().split("\n");
assert.equal(fakeSbxArgs.length, 2);
assert.match(fakeSbxArgs[0], /^create --name plywood-codex codex /);
assert.equal(fakeSbxArgs[1], "run plywood-codex");

run(["create", "--dry-run"]);

const commandExecOutput = run(["exec", "--dry-run", "--json", "--", "npm", "test"]);
const commandExec = JSON.parse(commandExecOutput);
assert.equal(commandExec.sandbox.name, createSandbox.name);
assert.equal(commandExec.interactive, false);
assert.deepEqual(commandExec.command, ["npm", "test"]);
assert.equal(commandExec.runtime.execute_attempted, false);

const runOutput = run([
  "exec",
  "product-readiness-qa",
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
