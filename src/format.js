export function formatHelp() {
  return `Plyboard CLI

Usage:
  plyboard init [--force]
  plyboard create [blueprint-id] [PATH...] [--context ./notes.md] [--dry-run] [--json]
  plyboard run [blueprint-id|sandbox-name] [--dry-run] [--json]
  plyboard exec [blueprint-id|sandbox-name] [--target demo --safety-mode draft-only] [-- <command>]
  plyboard context init [--force] [--json]
  plyboard context status [--json]
  plyboard blueprint list [--json]
  plyboard blueprint inspect [blueprint-id] [--json]
  plyboard review [latest|run-id|run-dir|manifest.json] [--only safe|needs_approval|blocked] [--json]
  plyboard approve [latest|run-id|run-dir] --action act-005 [--action act-018] [--actor operator]
  plyboard approve latest --all-needs-approval [--actor operator]
  plyboard export-audit [latest|run-id|run-dir] [--out exports/my-run]

Examples:
  plyboard create
  plyboard run
  plyboard exec --target demo --safety-mode draft-only
  plyboard exec -- npm test
  plyboard context status
  plyboard review latest
  plyboard review latest --only blocked
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
    `Plyboard run command: plyboard run ${result.name}`
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
    `Runtime available: ${result.runtime.available}`,
    `Runtime executed: ${result.runtime.execute_attempted}`,
    `Spec: ${result.sandbox.spec}`
  ];

  if (result.context_mounts.length > 0) {
    lines.push(`Context mounts:`);
    for (const mount of result.context_mounts) {
      lines.push(`- ${mount.source_path} (read-only, logical ${mount.logical_sandbox_path})`);
    }
  }

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
      `Run "plyboard context init" to create starter context files.`
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
    `  Policy rule: ${action.policy_rule}`,
    `  Before: ${action.before}`,
    `  After: ${action.after}`,
    `  Reasoning: ${action.reasoning}`,
    `  Rollback: ${action.rollback_note}${approval}`
  ].join("\n");
}
