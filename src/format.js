export function formatHelp() {
  return `Plyboard CLI

Usage:
  plyboard init [--force]
  plyboard blueprint list [--json]
  plyboard blueprint inspect <blueprint-id> [--json]
  plyboard run <blueprint-id> --target demo --safety-mode draft-only [--context ./AGENTS.md]
  plyboard review [latest|run-id|run-dir|manifest.json] [--only safe|needs_approval|blocked] [--json]
  plyboard approve [latest|run-id|run-dir] --action act-005 [--action act-018] [--actor operator]
  plyboard approve latest --all-needs-approval [--actor operator]
  plyboard export-audit [latest|run-id|run-dir] [--out exports/my-run]

Examples:
  plyboard run product-readiness-qa --target demo --safety-mode draft-only --context ./AGENTS.md
  plyboard review latest
  plyboard review latest --only blocked
`;
}

export function formatBlueprintList(blueprints) {
  if (blueprints.length === 0) {
    return "No blueprints installed.";
  }

  const lines = ["Installed blueprints:"];
  for (const blueprint of blueprints) {
    lines.push(`- ${blueprint.id}: ${blueprint.name} (${blueprint.runtime.name}, ${blueprint.runtime.mode})`);
  }
  return lines.join("\n");
}

export function formatBlueprintInspect(blueprint) {
  const lines = [
    `${blueprint.name}`,
    `ID: ${blueprint.id}`,
    `Version: ${blueprint.version}`,
    `Runtime: ${blueprint.runtime.name} (${blueprint.runtime.mode})`,
    `Image: ${blueprint.runtime.image}`,
    `Network: ${blueprint.runtime.network}`,
    `Secrets shared with sandbox: ${blueprint.runtime.secretsSharedWithSandbox}`,
    ``,
    `Agents:`
  ];

  for (const agent of blueprint.agents) {
    lines.push(`- ${agent.name}`);
    lines.push(`  Runtime blueprint: ${agent.runtimeBlueprint}`);
    lines.push(`  Toolkit: ${agent.toolkit.join(", ")}`);
    lines.push(`  Tools: ${agent.tools.join(", ")}`);
  }

  lines.push(``, `Context mounts: ${blueprint.contextMounts.allowed ? "allowed read-only" : "disabled"}`);
  lines.push(`Credential owner: ${blueprint.secretsPolicy.credentialOwner}`);
  lines.push(`Manifest schema: ${blueprint.manifestSchema}`);

  return lines.join("\n");
}

export function formatRunSummary(manifest) {
  const lines = [
    `Run created: ${manifest.run.id}`,
    `Blueprint: ${manifest.blueprint.name}`,
    `Runtime: ${manifest.blueprint.runtime} (${manifest.blueprint.runtime_mode})`,
    `Agents completed: ${manifest.agents.length}/${manifest.agents.length}`,
    `Target environment: ${manifest.run.target_environment}`,
    `Safety mode: ${manifest.run.safety_mode}`,
    `Secrets shared with sandbox: ${manifest.sbx.secrets_shared_with_sandbox}`,
    `Policy: ${manifest.policy_summary.safe} safe, ${manifest.policy_summary.needs_approval} needs approval, ${manifest.policy_summary.blocked} blocked`,
    `Artifacts: ${manifest.artifacts.run_dir}`,
    `Manifest: ${manifest.artifacts.manifest}`,
    `Audit packet: ${manifest.artifacts.audit_packet_md}`,
    `Rollback plan: ${manifest.artifacts.rollback_plan_md}`
  ];

  if (manifest.sbx.mounted_context.length > 0) {
    lines.push(`Context mounts: ${manifest.sbx.mounted_context.map((mount) => mount.source_path).join(", ")}`);
  }

  return lines.join("\n");
}

export function formatReview(manifest, { only = null } = {}) {
  const actions = only ? manifest.actions.filter((action) => action.policy_result === only) : manifest.actions;
  const lines = [
    `Plyboard Review`,
    ``,
    `Blueprint: ${manifest.blueprint.name}`,
    `Runtime: ${manifest.blueprint.runtime} (${manifest.blueprint.runtime_mode})`,
    `Run: ${manifest.run.id}`,
    `Status: ${manifest.run.status}`,
    `Target environment: ${manifest.run.target_environment}`,
    `Safety mode: ${manifest.run.safety_mode}`,
    `Agents completed: ${manifest.agents.length}/${manifest.agents.length}`,
    `Secrets shared with sandbox: ${manifest.sbx.secrets_shared_with_sandbox}`,
    `Policy: ${manifest.policy_summary.safe} safe | ${manifest.policy_summary.needs_approval} needs approval | ${manifest.policy_summary.blocked} blocked`,
    `Approvals recorded: ${(manifest.approvals || []).length}`,
    `Audit packet generated: ${manifest.audit_packet.generated}`,
    `Rollback plan generated: ${manifest.rollback_plan.generated}`,
    ``,
    `Agents and Toolkits:`
  ];

  for (const agent of manifest.agents) {
    lines.push(`- ${agent.name}: ${agent.toolkit.join(", ")}`);
  }

  lines.push(``, `Mounted Context:`);
  if (manifest.sbx.mounted_context.length === 0) {
    lines.push(`- None`);
  } else {
    for (const mount of manifest.sbx.mounted_context) {
      lines.push(`- ${mount.source_path} (${mount.type}, read-only, sha256 ${mount.sha256.slice(0, 12)})`);
    }
  }

  lines.push(``, `Product QA Findings:`);
  for (const product of manifest.product_findings) {
    lines.push(`- ${product.title} [${product.severity}]: ${product.summary}`);
    for (const check of product.checks) {
      lines.push(`  ${check.name}: ${check.result} - ${check.detail}`);
    }
  }

  lines.push(``, `Storefront Merchandising Findings:`);
  for (const finding of manifest.storefront_findings) {
    lines.push(`- ${finding.area} [${finding.severity}]: ${finding.summary}`);
    for (const check of finding.checks) {
      lines.push(`  ${check.name}: ${check.result} - ${check.detail}`);
    }
  }

  lines.push(``, only ? `Proposed Actions (${only}):` : `Proposed Actions:`);
  if (actions.length === 0) {
    lines.push(`- No actions matched.`);
  } else {
    for (const action of actions) {
      lines.push(formatAction(action));
    }
  }

  lines.push(
    ``,
    `Mock controls: Approve selected and Export audit packet are represented by policy state and export-audit.`
  );

  return lines.join("\n");
}

export function formatExportResult(result) {
  const lines = [`Audit packet exported for ${result.run_id}: ${result.exported_to}`, `Files:`];
  for (const file of result.files) {
    lines.push(`- ${file}`);
  }
  return lines.join("\n");
}

export function formatApprovalResult(approval) {
  const lines = [
    `Approval recorded: ${approval.id}`,
    `Run: ${approval.run_id}`,
    `Actor: ${approval.actor}`,
    `Status: ${approval.status}`,
    `Execution: ${approval.execution}`,
    `Actions: ${approval.action_ids.join(", ")}`
  ];

  if (approval.note) {
    lines.push(`Note: ${approval.note}`);
  }

  return lines.join("\n");
}

function formatAction(action) {
  const approval = action.approval ? `\n  Approval: ${action.approval.status} (${action.approval.approval_id})` : "";
  return [
    `- [${action.policy_result}] ${action.id} ${action.action_type} on ${action.resource}`,
    `  Agent/tool: ${action.agent_id} / ${action.tool}`,
    `  Risk: ${action.risk}`,
    `  Policy rule: ${action.policy_rule}`,
    `  Before: ${action.before}`,
    `  After: ${action.after}`,
    `  Reasoning: ${action.reasoning}`,
    `  Rollback: ${action.rollback_note}${approval}`
  ].join("\n");
}
