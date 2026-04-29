import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const VALID_RESULTS = new Set(["safe", "needs_approval", "blocked"]);

export function loadSafetyPolicy(policyPath, workspaceRoot) {
  const absolutePath = path.resolve(workspaceRoot, policyPath);
  const raw = fs.readFileSync(absolutePath, "utf8");
  const policy = JSON.parse(raw);
  validateSafetyPolicy(policy, policyPath);

  return {
    ...policy,
    path: policyPath,
    absolute_path: absolutePath,
    sha256: crypto.createHash("sha256").update(raw).digest("hex")
  };
}

export function validateSafetyPolicy(policy, label = "safety policy") {
  if (policy.schema_version !== "plywood.safety_policy.v1") {
    throw new Error(`${label} must use schema_version plywood.safety_policy.v1.`);
  }

  for (const field of ["id", "name", "version", "default_result"]) {
    if (!policy[field]) {
      throw new Error(`${label} is missing required field ${field}.`);
    }
  }

  if (!VALID_RESULTS.has(policy.default_result)) {
    throw new Error(`${label} has invalid default_result "${policy.default_result}".`);
  }

  if (!Array.isArray(policy.rules) || policy.rules.length === 0) {
    throw new Error(`${label} must define at least one rule.`);
  }

  for (const rule of policy.rules) {
    for (const field of ["id", "name", "result", "match", "reason"]) {
      if (!rule[field]) {
        throw new Error(`${label} rule is missing required field ${field}.`);
      }
    }

    if (!VALID_RESULTS.has(rule.result)) {
      throw new Error(`${label} rule "${rule.id}" has invalid result "${rule.result}".`);
    }

    if (typeof rule.match !== "object" || Array.isArray(rule.match)) {
      throw new Error(`${label} rule "${rule.id}" must define a match object.`);
    }
  }
}

export function snapshotSafetyPolicy(policy) {
  if (!policy) {
    return null;
  }

  return {
    schema_version: policy.schema_version,
    id: policy.id,
    name: policy.name,
    version: policy.version,
    description: policy.description,
    path: policy.path,
    sha256: policy.sha256,
    default_result: policy.default_result,
    default_reason: policy.default_reason,
    rules: policy.rules.map((rule) => ({
      id: rule.id,
      name: rule.name,
      result: rule.result,
      match: rule.match,
      reason: rule.reason
    }))
  };
}

export function buildLegacySafetyPolicy(policyConfig = {}, { id = "legacy.default", name = "Legacy Safety Policy" } = {}) {
  return {
    schema_version: "plywood.safety_policy.v1",
    id,
    name,
    version: "0.1.0",
    description: "Compatibility policy generated from blueprint policy lists.",
    default_result: "needs_approval",
    default_reason: "Actions that are not explicitly allowlisted default to operator approval.",
    rules: [
      {
        id: "blocked-action-types",
        name: "Blocked action types",
        result: "blocked",
        match: {
          action_type: policyConfig.blocked || []
        },
        reason: "This action type is blocked by the blueprint policy."
      },
      {
        id: "approval-required-action-types",
        name: "Approval-required action types",
        result: "needs_approval",
        match: {
          action_type: policyConfig.needsApproval || []
        },
        reason: "This action type requires operator approval."
      },
      {
        id: "safe-action-types",
        name: "Safe action types",
        result: "safe",
        match: {
          action_type: policyConfig.safe || []
        },
        reason: "This action type is allowlisted by the blueprint policy."
      }
    ]
  };
}
