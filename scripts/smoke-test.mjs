import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const cli = path.join(root, "bin", "plyboard.mjs");

function run(args) {
  return execFileSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
}

const listOutput = run(["blueprint", "list"]);
assert.match(listOutput, /product-readiness-qa/);

const inspectOutput = run(["blueprint", "inspect", "product-readiness-qa"]);
assert.match(inspectOutput, /Docker SBX/);
assert.match(inspectOutput, /Secrets shared with sandbox: false/);

const runOutput = run([
  "run",
  "product-readiness-qa",
  "--target",
  "demo",
  "--safety-mode",
  "draft-only",
  "--context",
  "./AGENTS.md",
  "--context",
  "./examples/brand-context"
]);
assert.match(runOutput, /Run created:/);
assert.match(runOutput, /Policy:/);

const latestRunDir = fs.readFileSync(path.join(root, ".plyboard", "latest-run"), "utf8").trim();
const manifest = JSON.parse(fs.readFileSync(path.join(root, latestRunDir, "manifest.json"), "utf8"));

assert.equal(manifest.blueprint.id, "product-readiness-qa");
assert.equal(manifest.sbx.secrets_shared_with_sandbox, false);
assert.equal(manifest.sbx.api_access.sandbox_receives_raw_credentials, false);
assert.equal(manifest.product_findings.length, 3);
assert.equal(manifest.storefront_findings.length, 1);
assert.ok(manifest.policy_summary.safe > 0);
assert.ok(manifest.policy_summary.needs_approval > 0);
assert.ok(manifest.policy_summary.blocked > 0);
assert.ok(manifest.sbx.mounted_context.some((mount) => mount.source_path === "AGENTS.md"));
assert.ok(manifest.sbx.mounted_context.some((mount) => mount.source_path === "examples/brand-context"));

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
