export const SAFE_ACTIONS = new Set([
  "product.read",
  "product.enrichment_draft",
  "product.seo_draft",
  "product.image_alt_text_draft",
  "product.media_issue_flag",
  "product.publish_readiness_check",
  "storefront.product_quality_audit",
  "collection.merchandising_recommendation"
]);

export const NEEDS_APPROVAL_ACTIONS = new Set([
  "product.publish",
  "product.publish.ready",
  "collection.publish",
  "collection.sort_update",
  "product.update_price",
  "inventory.update"
]);

export const BLOCKED_ACTIONS = new Set([
  "product.media_delete",
  "inventory.decrement",
  "theme.publish.production",
  "customer.email_send",
  "payment.capture",
  "refund.create",
  "admin_user.create",
  "webhook.create"
]);

const WRITE_SCOPES_ALLOWED_IN_READ_ONLY = new Set(["read", "audit", "recommendation"]);

export function classifyActions(actions, runContext) {
  return actions.map((action) => ({
    ...action,
    ...classifyAction(action, runContext)
  }));
}

export function classifyAction(action, runContext) {
  const actionType = action.action_type;
  const writeScope = action.write_scope || "unknown";

  if (BLOCKED_ACTIONS.has(actionType) || writeScope === "destructive" || writeScope === "external") {
    return {
      policy_result: "blocked",
      policy_rule: "blocked_action_or_destructive_scope",
      reasoning: `${actionType} is destructive, external, or outside the Product Readiness QA blueprint safety envelope.`
    };
  }

  if (runContext.safetyMode === "read-only" && !WRITE_SCOPES_ALLOWED_IN_READ_ONLY.has(writeScope)) {
    return {
      policy_result: "needs_approval",
      policy_rule: "read_only_mode_requires_approval_for_writes",
      reasoning: `${actionType} proposes a ${writeScope} write while the run is in read-only mode.`
    };
  }

  if (NEEDS_APPROVAL_ACTIONS.has(actionType)) {
    return {
      policy_result: "needs_approval",
      policy_rule: "approval_required_action_type",
      reasoning: `${actionType} can affect publish state, live merchandising, pricing, or inventory and requires operator approval.`
    };
  }

  if (
    runContext.targetEnvironment === "production" &&
    ["live", "production", "staging"].includes(writeScope)
  ) {
    return {
      policy_result: "needs_approval",
      policy_rule: "production_write_requires_approval",
      reasoning: `${actionType} targets a production-adjacent write scope and requires approval.`
    };
  }

  if (SAFE_ACTIONS.has(actionType)) {
    return {
      policy_result: "safe",
      policy_rule: "safe_action_allowlist",
      reasoning: `${actionType} is allowlisted for this blueprint and does not directly modify live production state.`
    };
  }

  return {
    policy_result: "needs_approval",
    policy_rule: "unknown_action_defaults_to_approval",
    reasoning: `${actionType} is not in the allowlist and defaults to approval before execution.`
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
