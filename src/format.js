export function formatHelp() {
  return `Plywood CLI

Usage:
  plywood init [--force]
  plywood create [blueprint-id] [PATH...] [--context ./notes.md] [--dry-run] [--json]
  plywood run [blueprint-id|sandbox-name] [--dry-run] [--json]
  plywood exec [blueprint-id|sandbox-name] [--target demo --safety-mode draft-only] [-- <command>]
  plywood context init [--force] [--json]
  plywood context status [--json]
  plywood blueprint list [--json]
  plywood blueprint inspect [blueprint-id] [--json]
  plywood review [latest|run-id|run-dir|manifest.json] [--only safe|needs_approval|blocked] [--json]
  plywood approve [latest|run-id|run-dir] --action act-005 [--action act-018] [--actor operator]
  plywood approve latest --all-needs-approval [--actor operator]
  plywood export-audit [latest|run-id|run-dir] [--out exports/my-run]

Examples:
  plywood create
  plywood run
  plywood exec -- npm test
  plywood exec product-readiness-qa --target demo --safety-mode draft-only
  plywood context status
  plywood review latest
  plywood review latest --only blocked
`;
}

export function formatCreateSandboxResult(result) {
  const lines = [
    `Sandbox ${result.status}: ${result.name}`,
    `Blueprint: ${result.blueprint.name}`,
    `Runtime: ${result.runtime}`,
    `Secrets shared with sandbox: ${result.secrets_shared_with_sandbox}`,
    `Runtime available: ${result.sbx.available}`,
    `Runtime executed: ${result.sbx.execute_attempted}`,
    `Spec: ${result.artifacts.spec}`,
    `Plywood run command: plywood run ${result.name}`
  ];

  if (result.context_mounts.length > 0) {
    lines.push(`Context mounts:`);
    for (const mount of result.context_mounts) {
      lines.push(
        `- ${mount.source_path} as ${mount.sbx_workspace_arg} (read-only, logical ${mount.logical_sandbox_path})`
      );
    }
  }

  if (result.sbx.reason_not_executed) {
    lines.push(`Note: ${result.sbx.reason_not_executed}`);
  }

  if (result.next_steps.length > 0) {
    lines.push(`Next steps:`);
    for (const step of result.next_steps) {
      lines.push(`- ${step}`);
    }
  }

  return lines.join("\n");
}

export function formatRunSandboxResult(result) {
  const lines = [
    `Sandbox ${result.status}: ${result.sandbox.name}`,
    `Blueprint: ${result.sandbox.blueprint.name}`,
    `Runtime: ${result.sandbox.runtime}`,
    `Interactive: ${result.interactive}`,
    `Secrets shared with sandbox: ${result.secrets_shared_with_sandbox}`,
    result.runtime.runner_version ? `Runner version: ${result.runtime.runner_version}` : null,
    `Runtime available: ${result.runtime.available}`,
    `Runtime executed: ${result.runtime.execute_attempted}`,
    result.runtime.prepare_command ? `SBX prepare command: ${shellCommand(result.runtime.prepare_command)}` : null,
    `SBX command: ${shellCommand(result.runtime.command)}`,
    `Spec: ${result.sandbox.spec}`
  ].filter(Boolean);

  if (result.context_mounts.length > 0) {
    lines.push(`Context mounts:`);
    for (const mount of result.context_mounts) {
      lines.push(`- ${mount.source_path} (read-only, logical ${mount.logical_sandbox_path})`);
    }
  }

  if (result.runtime.reason_not_executed) {
    lines.push(`Note: ${result.runtime.reason_not_executed}`);
  }

  if (
    result.status === "failed" &&
    result.runtime.prepare_attempted &&
    result.runtime.prepare_exit_code !== 0
  ) {
    lines.push(`SBX prepare exit code: ${result.runtime.prepare_exit_code}`);
    pushOutputLines(lines, "SBX prepare stdout", result.runtime.prepare_stdout);
    pushOutputLines(lines, "SBX prepare stderr", result.runtime.prepare_stderr);
  }

  if (result.runtime.execute_attempted && result.runtime.exit_code !== 0) {
    lines.push(`SBX exit code: ${result.runtime.exit_code}`);
    pushOutputLines(lines, "SBX stdout", result.runtime.stdout);
    pushOutputLines(lines, "SBX stderr", result.runtime.stderr);
  }

  if (result.next_steps.length > 0) {
    lines.push(`Next steps:`);
    for (const step of result.next_steps) {
      lines.push(`- ${step}`);
    }
  }

  return lines.join("\n");
}

export function formatExecSandboxResult(result) {
  const lines = [
    `Command ${result.status}: ${result.command.join(" ")}`,
    `Sandbox: ${result.sandbox.name}`,
    `Blueprint: ${result.sandbox.blueprint.name}`,
    `Runtime: ${result.sandbox.runtime}`,
    `Interactive: ${result.interactive}`,
    `Secrets shared with sandbox: ${result.secrets_shared_with_sandbox}`,
    `Runtime available: ${result.runtime.available}`,
    `Runtime executed: ${result.runtime.execute_attempted}`,
    `Spec: ${result.sandbox.spec}`
  ];

  if (result.runtime.reason_not_executed) {
    lines.push(`Note: ${result.runtime.reason_not_executed}`);
  }

  if (result.next_steps.length > 0) {
    lines.push(`Next steps:`);
    for (const step of result.next_steps) {
      lines.push(`- ${step}`);
    }
  }

  return lines.join("\n");
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
  if (blueprint.contextMounts.defaultLocalPath) {
    lines.push(
      `Default context: ${blueprint.contextMounts.defaultLocalPath} -> ${blueprint.contextMounts.defaultSandboxPath}`
    );
  }
  if (blueprint.runtime.agentAdapter) {
    lines.push(`Runtime agent adapter: ${blueprint.runtime.agentAdapter}`);
  }
  if (blueprint.safetyPolicy) {
    lines.push(`Safety policy: ${blueprint.safetyPolicy.id} (${blueprint.safetyPolicy.rules.length} rules)`);
  }
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
    `Safety policy: ${manifest.safety_policy ? `${manifest.safety_policy.id} (${manifest.safety_policy.rules.length} rules)` : "not recorded"}`,
    `Secrets shared with sandbox: ${manifest.sbx.secrets_shared_with_sandbox}`,
    `Policy: ${manifest.policy_summary.safe} safe, ${manifest.policy_summary.needs_approval} needs approval, ${manifest.policy_summary.blocked} blocked`,
    `Artifacts: ${manifest.artifacts.run_dir}`,
    `Manifest: ${manifest.artifacts.manifest}`,
    `Audit packet: ${manifest.artifacts.audit_packet_md}`,
    `Rollback plan: ${manifest.artifacts.rollback_plan_md}`
  ];

  if (manifest.sbx.mounted_context.length > 0) {
    lines.push(`Context mounts: ${manifest.sbx.mounted_context.map(formatMountCompact).join(", ")}`);
  }

  return lines.join("\n");
}

export function formatContextInitResult(result) {
  return result.message;
}

export function formatContextStatus(status) {
  if (!status.exists) {
    return [
      `Default context: missing`,
      `Source path: ${status.source_path}`,
      `Sandbox path: ${status.sandbox_path}`,
      `Auto-mount: ${status.auto_mount}`,
      `Run "plywood context init" to create starter context files.`
    ].join("\n");
  }

  const lines = [
    `Default context: ready`,
    `Source path: ${status.source_path}`,
    `Sandbox path: ${status.sandbox_path}`,
    `Mode: read-only`,
    `Auto-mount: ${status.auto_mount}`,
    `Files: ${status.file_count}`,
    `Bytes: ${status.total_bytes}`,
    `SHA256: ${status.sha256}`
  ];

  if (status.files && status.files.length > 0) {
    lines.push(`Mounted files:`);
    for (const file of status.files) {
      lines.push(`- ${file.relative_path} -> ${file.sandbox_path}`);
    }
  }

  return lines.join("\n");
}

export function formatReview(manifest, { only = null } = {}) {
  const actions = only ? manifest.actions.filter((action) => action.policy_result === only) : manifest.actions;
  const lines = [
    `Plywood Review`,
    ``,
    `Blueprint: ${manifest.blueprint.name}`,
    `Runtime: ${manifest.blueprint.runtime} (${manifest.blueprint.runtime_mode})`,
    `Run: ${manifest.run.id}`,
    `Status: ${manifest.run.status}`,
    `Target environment: ${manifest.run.target_environment}`,
    `Safety mode: ${manifest.run.safety_mode}`,
    `Safety policy: ${manifest.safety_policy ? `${manifest.safety_policy.id} (${manifest.safety_policy.rules.length} rules)` : "not recorded"}`,
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
      lines.push(
        `- ${mount.source_path} -> ${mount.sandbox_path} (${mount.mount_role}, ${mount.type}, read-only, sha256 ${mount.sha256.slice(0, 12)})`
      );
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

function formatMountCompact(mount) {
  return `${mount.source_path} -> ${mount.sandbox_path}`;
}

function formatAction(action) {
  const approval = action.approval ? `\n  Approval: ${action.approval.status} (${action.approval.approval_id})` : "";
  return [
    `- [${action.policy_result}] ${action.id} ${action.action_type} on ${action.resource}`,
    `  Agent/tool: ${action.agent_id} / ${action.tool}`,
    `  Risk: ${action.risk}`,
    `  Policy rule: ${action.policy_rule_name || action.policy_rule} (${action.policy_rule})`,
    `  Before: ${action.before}`,
    `  After: ${action.after}`,
    `  Reasoning: ${action.reasoning}`,
    `  Rollback: ${action.rollback_note}${approval}`
  ].join("\n");
}

function pushOutputLines(lines, label, value) {
  const output = String(value || "").trim();
  if (!output) {
    return;
  }

  lines.push(`${label}:`);
  for (const line of output.split("\n")) {
    lines.push(`  ${line}`);
  }
}

function shellCommand(parts) {
  return parts.map(shellQuote).join(" ");
}

function shellQuote(value) {
  if (/^[a-zA-Z0-9_./:=@+-]+$/.test(value)) {
    return value;
  }
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}
