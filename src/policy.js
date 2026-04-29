const FALLBACK_POLICY = {
  schema_version: "plywood.safety_policy.v1",
  id: "fallback.needs_approval",
  name: "Fallback Approval Policy",
  version: "0.1.0",
  default_result: "needs_approval",
  default_reason: "No structured safety policy was attached, so the action defaults to operator approval.",
  rules: []
};

export function classifyActions(actions, runContext, safetyPolicy = null) {
  const policy = safetyPolicy || runContext.safetyPolicy || FALLBACK_POLICY;
  return actions.map((action) => ({
    ...action,
    ...classifyAction(action, runContext, policy)
  }));
}

export function classifyAction(action, runContext, safetyPolicy = FALLBACK_POLICY) {
  const subject = {
    ...action,
    target_environment: runContext.targetEnvironment,
    safety_mode: runContext.safetyMode
  };

  for (const rule of safetyPolicy.rules) {
    if (matchesRule(rule, subject)) {
      return {
        policy_result: rule.result,
        policy_rule: rule.id,
        policy_rule_name: rule.name,
        reasoning: rule.reason
      };
    }
  }

  return {
    policy_result: safetyPolicy.default_result,
    policy_rule: `${safetyPolicy.id}.default`,
    policy_rule_name: "Default policy result",
    reasoning: safetyPolicy.default_reason || "No explicit safety rule matched this action."
  };
}

export function summarizePolicy(actions) {
  const summary = {
    safe: 0,
    needs_approval: 0,
    blocked: 0,
    total: actions.length
  };

  for (const action of actions) {
    summary[action.policy_result] += 1;
  }

  return summary;
}

function matchesRule(rule, subject) {
  return matchesObject(rule.match, subject);
}

function matchesObject(match, subject) {
  for (const [key, expected] of Object.entries(match)) {
    if (key === "not") {
      if (matchesObject(expected, subject)) {
        return false;
      }
      continue;
    }

    if (!matchesValue(subject[key], expected)) {
      return false;
    }
  }

  return true;
}

function matchesValue(actual, expected) {
  if (Array.isArray(expected)) {
    return expected.length > 0 && expected.includes(actual);
  }

  return actual === expected;
}
