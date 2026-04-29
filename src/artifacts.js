import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export function writeRunArtifacts(manifest, workspaceRoot) {
  const runDir = path.join(workspaceRoot, "runs", manifest.run.id);
  fs.mkdirSync(runDir, { recursive: true });
  fs.mkdirSync(path.join(workspaceRoot, ".plywood"), { recursive: true });

  const brokerTrace = manifest.broker_trace || [];
  const auditPacket = buildAuditPacket(manifest);
  const auditMarkdown = renderAuditPacketMarkdown(manifest, auditPacket);
  const rollbackMarkdown = renderRollbackPlanMarkdown(manifest);
  const runLog = buildRunLog(manifest);

  const paths = {
    run_dir: path.relative(workspaceRoot, runDir),
    manifest: path.relative(workspaceRoot, path.join(runDir, "manifest.json")),
    audit_packet_json: path.relative(workspaceRoot, path.join(runDir, "audit-packet.json")),
    audit_packet_md: path.relative(workspaceRoot, path.join(runDir, "audit-packet.md")),
    rollback_plan_md: path.relative(workspaceRoot, path.join(runDir, "rollback-plan.md")),
    broker_trace: path.relative(workspaceRoot, path.join(runDir, "broker-trace.json")),
    run_log: path.relative(workspaceRoot, path.join(runDir, "run-log.jsonl"))
  };

  const finalManifest = {
    ...manifest,
    audit_packet: {
      generated: true,
      path: paths.audit_packet_json,
      markdown_path: paths.audit_packet_md,
      sha256: sha256(JSON.stringify(auditPacket, null, 2))
    },
    rollback_plan: {
      generated: true,
      path: paths.rollback_plan_md,
      action_count: manifest.actions.filter((action) => action.policy_result !== "blocked").length
    },
    artifacts: paths
  };

  writeJson(path.join(runDir, "manifest.json"), finalManifest);
  writeJson(path.join(runDir, "audit-packet.json"), auditPacket);
  fs.writeFileSync(path.join(runDir, "audit-packet.md"), auditMarkdown);
  fs.writeFileSync(path.join(runDir, "rollback-plan.md"), rollbackMarkdown);
  writeJson(path.join(runDir, "broker-trace.json"), brokerTrace);
  fs.writeFileSync(path.join(runDir, "run-log.jsonl"), runLog.map((entry) => JSON.stringify(entry)).join("\n"));
  fs.writeFileSync(path.join(workspaceRoot, ".plywood", "latest-run"), paths.run_dir);

  return { manifest: finalManifest, runDir };
}

export function loadRun(reference = "latest", workspaceRoot) {
  const manifestPath = resolveManifestPath(reference, workspaceRoot);
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Run manifest not found: ${reference}`);
  }
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

export function resolveManifestPath(reference = "latest", workspaceRoot) {
  const ref = reference || "latest";

  if (ref === "latest") {
    const latestPath = path.join(workspaceRoot, ".plywood", "latest-run");
    if (!fs.existsSync(latestPath)) {
      throw new Error("No latest run found. Run a blueprint first.");
    }
    const runDir = fs.readFileSync(latestPath, "utf8").trim();
    return path.resolve(workspaceRoot, runDir, "manifest.json");
  }

  const directPath = path.resolve(workspaceRoot, ref);
  if (fs.existsSync(directPath)) {
    const stats = fs.statSync(directPath);
    return stats.isDirectory() ? path.join(directPath, "manifest.json") : directPath;
  }

  return path.resolve(workspaceRoot, "runs", ref, "manifest.json");
}

export function exportAudit(reference, workspaceRoot, outDir = null) {
  const manifest = loadRun(reference, workspaceRoot);
  const sourceDir = path.resolve(workspaceRoot, manifest.artifacts.run_dir);
  const targetDir = outDir
    ? path.resolve(workspaceRoot, outDir)
    : path.resolve(workspaceRoot, "exports", manifest.run.id);

  fs.mkdirSync(targetDir, { recursive: true });

  const files = [
    "manifest.json",
    "audit-packet.json",
    "audit-packet.md",
    "rollback-plan.md",
    "broker-trace.json"
  ];

  for (const file of files) {
    fs.copyFileSync(path.join(sourceDir, file), path.join(targetDir, file));
  }

  for (const optionalFile of ["approval-record.json", "approval-log.jsonl", "execution-ledger.json", "execution-ledger.md"]) {
    const sourcePath = path.join(sourceDir, optionalFile);
    if (fs.existsSync(sourcePath)) {
      fs.copyFileSync(sourcePath, path.join(targetDir, optionalFile));
      files.push(optionalFile);
    }
  }

  return {
    run_id: manifest.run.id,
    exported_to: path.relative(workspaceRoot, targetDir),
    files: files.map((file) => path.join(path.relative(workspaceRoot, targetDir), file))
  };
}

export function recordApproval(reference, workspaceRoot, { actionIds, allNeedsApproval, actor, note }) {
  const manifestPath = resolveManifestPath(reference, workspaceRoot);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const runDir = path.dirname(manifestPath);
  const selectedActions = allNeedsApproval
    ? manifest.actions.filter((action) => action.policy_result === "needs_approval")
    : actionIds.map((id) => manifest.actions.find((action) => action.id === id));

  const missingIds = allNeedsApproval
    ? []
    : actionIds.filter((id) => !manifest.actions.some((action) => action.id === id));
  if (missingIds.length > 0) {
    throw new Error(`Unknown action id(s): ${missingIds.join(", ")}`);
  }

  if (selectedActions.length === 0) {
    throw new Error("No approval-required actions selected.");
  }

  const blocked = selectedActions.filter((action) => action.policy_result === "blocked");
  if (blocked.length > 0) {
    throw new Error(`Blocked actions cannot be approved: ${blocked.map((action) => action.id).join(", ")}`);
  }

  const notApprovalRequired = selectedActions.filter((action) => action.policy_result !== "needs_approval");
  if (notApprovalRequired.length > 0) {
    throw new Error(
      `Only needs_approval actions can be approved: ${notApprovalRequired.map((action) => action.id).join(", ")}`
    );
  }

  const createdAt = new Date().toISOString();
  const approval = {
    id: `approval-${createdAt.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "z")}-${crypto
      .randomBytes(2)
      .toString("hex")}`,
    run_id: manifest.run.id,
    created_at: createdAt,
    actor,
    note,
    status: "approved_not_executed",
    execution: "mocked_no_commerce_write",
    action_ids: selectedActions.map((action) => action.id),
    actions: selectedActions.map((action) => ({
      id: action.id,
      action_type: action.action_type,
      resource: action.resource,
      risk: action.risk,
      rollback_note: action.rollback_note
    }))
  };

  const approvals = [...(manifest.approvals || []), approval];
  const updatedManifest = {
    ...manifest,
    approvals,
    actions: manifest.actions.map((action) =>
      approval.action_ids.includes(action.id)
        ? {
            ...action,
            approval: {
              status: "approved_not_executed",
              approval_id: approval.id,
              approved_at: createdAt,
              actor
            }
          }
        : action
    )
  };

  const auditPacket = buildAuditPacket(updatedManifest);
  const auditPacketJson = JSON.stringify(auditPacket, null, 2);
  const finalManifest = {
    ...updatedManifest,
    audit_packet: {
      ...updatedManifest.audit_packet,
      sha256: sha256(auditPacketJson)
    }
  };

  writeJson(manifestPath, finalManifest);
  fs.writeFileSync(path.join(runDir, "audit-packet.json"), `${auditPacketJson}\n`);
  fs.writeFileSync(path.join(runDir, "audit-packet.md"), renderAuditPacketMarkdown(finalManifest, auditPacket));
  writeJson(path.join(runDir, "approval-record.json"), { approvals });
  fs.appendFileSync(path.join(runDir, "approval-log.jsonl"), `${JSON.stringify(approval)}\n`);

  return approval;
}

export function executeRun(reference, workspaceRoot, { actor = "demo-operator" } = {}) {
  const manifestPath = resolveManifestPath(reference, workspaceRoot);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const runDir = path.dirname(manifestPath);
  const startedAt = new Date().toISOString();
  const ledgerEntries = manifest.actions.map((action, index) =>
    buildExecutionEntry(action, {
      actor,
      index,
      runId: manifest.run.id,
      timestamp: startedAt
    })
  );
  const completedAt = new Date().toISOString();
  const summary = summarizeExecution(ledgerEntries);
  const ledger = {
    schema_version: "plywood.execution_ledger.v1",
    run_id: manifest.run.id,
    actor,
    mode: "mocked_host_api_broker",
    started_at: startedAt,
    completed_at: completedAt,
    secrets_shared_with_sandbox: manifest.sbx.secrets_shared_with_sandbox,
    summary,
    entries: ledgerEntries
  };
  const ledgerJson = JSON.stringify(ledger, null, 2);

  const paths = {
    ...manifest.artifacts,
    execution_ledger_json: path.relative(workspaceRoot, path.join(runDir, "execution-ledger.json")),
    execution_ledger_md: path.relative(workspaceRoot, path.join(runDir, "execution-ledger.md"))
  };

  const updatedManifest = {
    ...manifest,
    actions: manifest.actions.map((action) => {
      const entry = ledgerEntries.find((item) => item.action_id === action.id);
      return {
        ...action,
        execution: {
          status: entry.status,
          ledger_entry_id: entry.id,
          executor: entry.executor,
          executed_at: entry.status === "mock_executed" ? entry.completed_at : null,
          reason: entry.reason
        }
      };
    }),
    execution: {
      generated: true,
      status: "completed",
      mode: ledger.mode,
      actor,
      started_at: startedAt,
      completed_at: completedAt,
      summary,
      path: paths.execution_ledger_json,
      markdown_path: paths.execution_ledger_md,
      sha256: sha256(ledgerJson)
    },
    artifacts: paths
  };

  const auditPacket = buildAuditPacket(updatedManifest);
  const auditPacketJson = JSON.stringify(auditPacket, null, 2);
  const finalManifest = {
    ...updatedManifest,
    audit_packet: {
      ...updatedManifest.audit_packet,
      sha256: sha256(auditPacketJson)
    }
  };

  writeJson(path.join(runDir, "execution-ledger.json"), ledger);
  fs.writeFileSync(path.join(runDir, "execution-ledger.md"), renderExecutionLedgerMarkdown(finalManifest, ledger));
  writeJson(manifestPath, finalManifest);
  fs.writeFileSync(path.join(runDir, "audit-packet.json"), `${auditPacketJson}\n`);
  fs.writeFileSync(path.join(runDir, "audit-packet.md"), renderAuditPacketMarkdown(finalManifest, auditPacket));
  const runLogPath = path.join(runDir, "run-log.jsonl");
  const runLogPrefix =
    fs.existsSync(runLogPath) && fs.statSync(runLogPath).size > 0 && !fs.readFileSync(runLogPath, "utf8").endsWith("\n")
      ? "\n"
      : "";
  fs.appendFileSync(
    runLogPath,
    `${runLogPrefix}${JSON.stringify({
      run_id: manifest.run.id,
      at: completedAt,
      level: "info",
      event: "execution.completed",
      message: `${summary.mock_executed} actions mock-executed, ${summary.skipped_unapproved} skipped, ${summary.blocked} blocked.`
    })}\n`
  );

  return {
    run_id: manifest.run.id,
    status: "completed",
    actor,
    mode: ledger.mode,
    summary,
    ledger_path: paths.execution_ledger_json,
    ledger_markdown_path: paths.execution_ledger_md,
    ledger
  };
}

function buildExecutionEntry(action, { actor, index, runId, timestamp }) {
  const execution = classifyExecution(action);
  return {
    id: `exec-${String(index + 1).padStart(3, "0")}`,
    run_id: runId,
    action_id: action.id,
    action_type: action.action_type,
    resource: action.resource,
    agent_id: action.agent_id,
    tool: action.tool,
    executor: action.tool || "shopify-api-broker",
    actor,
    policy_result: action.policy_result,
    policy_rule: action.policy_rule,
    policy_rule_name: action.policy_rule_name,
    approval_id: action.approval?.approval_id || null,
    status: execution.status,
    reason: execution.reason,
    started_at: timestamp,
    completed_at: timestamp,
    before: action.before,
    after: action.after,
    rollback_note: action.rollback_note,
    broker_call: {
      mode: "host_api_broker",
      credential_location: "host_api_broker",
      secret_material_returned_to_sandbox: false,
      outbound_call_mocked: execution.status === "mock_executed",
      scoped_to_action_id: action.id
    }
  };
}

function classifyExecution(action) {
  if (action.policy_result === "blocked") {
    return {
      status: "blocked",
      reason: "The safety policy blocked this action before execution."
    };
  }

  if (action.policy_result === "needs_approval" && !action.approval) {
    return {
      status: "skipped_unapproved",
      reason: "The action needs operator approval and no approval record was found."
    };
  }

  if (action.policy_result === "needs_approval") {
    return {
      status: "mock_executed",
      reason: `Approved by ${action.approval.actor}; mocked through the host API broker.`
    };
  }

  return {
    status: "mock_executed",
    reason: "Safe action mock-executed automatically through the host API broker."
  };
}

function summarizeExecution(entries) {
  const summary = {
    mock_executed: 0,
    safe_executed: 0,
    approved_executed: 0,
    skipped_unapproved: 0,
    blocked: 0,
    total: entries.length
  };

  for (const entry of entries) {
    summary[entry.status] += 1;
    if (entry.status === "mock_executed" && entry.policy_result === "safe") {
      summary.safe_executed += 1;
    }
    if (entry.status === "mock_executed" && entry.policy_result === "needs_approval") {
      summary.approved_executed += 1;
    }
  }

  return summary;
}

function buildAuditPacket(manifest) {
  return {
    generated_at: new Date().toISOString(),
    run: manifest.run,
    blueprint: manifest.blueprint,
    agents: manifest.agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      status: agent.status,
      runtime_blueprint: agent.runtime_blueprint,
      toolkit: agent.toolkit,
      tools_used: agent.tools_used
    })),
    sbx: manifest.sbx,
    safety_policy: manifest.safety_policy || null,
    policy_summary: manifest.policy_summary,
    context_mounts: manifest.sbx.mounted_context,
    findings: {
      products: manifest.product_findings,
      storefront: manifest.storefront_findings
    },
    proposed_actions: manifest.actions,
    approvals: manifest.approvals || [],
    execution: manifest.execution || null,
    attestations: [
      "Docker SBX execution was mocked for demo scope.",
      "No API secret was shared with the sandbox.",
      "Commerce API calls were represented as host-side broker tool calls.",
      "Blocked actions were not executed and are not approvable by this packet."
    ]
  };
}

function renderAuditPacketMarkdown(manifest, auditPacket) {
  const lines = [
    `# Plywood Audit Packet`,
    ``,
    `Run: ${manifest.run.id}`,
    `Blueprint: ${manifest.blueprint.name}`,
    `Runtime: ${manifest.blueprint.runtime} (${manifest.blueprint.runtime_mode})`,
    `Target: ${manifest.run.target_environment}`,
    `Safety mode: ${manifest.run.safety_mode}`,
    `Secrets shared with sandbox: ${manifest.sbx.secrets_shared_with_sandbox}`,
    ``,
    `## Safety Policy`,
    ``
  ];

  if (manifest.safety_policy) {
    lines.push(
      `- ID: ${manifest.safety_policy.id}`,
      `- Version: ${manifest.safety_policy.version}`,
      `- Source: ${manifest.safety_policy.path}`,
      `- SHA256: ${manifest.safety_policy.sha256}`,
      `- Default result: ${manifest.safety_policy.default_result}`,
      `- Rules: ${manifest.safety_policy.rules.length}`,
      ``
    );
  } else {
    lines.push(`- No structured safety policy snapshot recorded.`, ``);
  }

  lines.push(
    `## Policy Summary`,
    ``,
    `- Safe: ${manifest.policy_summary.safe}`,
    `- Needs approval: ${manifest.policy_summary.needs_approval}`,
    `- Blocked: ${manifest.policy_summary.blocked}`,
    `- Total: ${manifest.policy_summary.total}`,
    ``,
    `## Agents`,
    ``
  );

  for (const agent of auditPacket.agents) {
    lines.push(`- ${agent.name}: ${agent.status} via ${agent.runtime_blueprint}`);
  }

  lines.push(``, `## Context Mounts`, ``);
  if (manifest.sbx.mounted_context.length === 0) {
    lines.push(`- None`);
  } else {
    for (const mount of manifest.sbx.mounted_context) {
      lines.push(
        `- ${mount.source_path} -> ${mount.sandbox_path} (${mount.mount_role}, ${mount.type}, read-only, sha256 ${mount.sha256})`
      );
    }
  }

  lines.push(``, `## Product Findings`, ``);
  for (const product of manifest.product_findings) {
    lines.push(`### ${product.title}`);
    lines.push(`Severity: ${product.severity}`);
    lines.push(product.summary);
    lines.push(``);
    for (const check of product.checks) {
      lines.push(`- ${check.name}: ${check.result} - ${check.detail}`);
    }
    lines.push(``);
  }

  lines.push(`## Storefront Findings`, ``);
  for (const finding of manifest.storefront_findings) {
    lines.push(`### ${finding.area}`);
    lines.push(`Severity: ${finding.severity}`);
    lines.push(finding.summary);
    lines.push(``);
    for (const check of finding.checks) {
      lines.push(`- ${check.name}: ${check.result} - ${check.detail}`);
    }
    lines.push(``);
  }

  lines.push(`## Proposed Actions`, ``);
  for (const action of manifest.actions) {
    lines.push(`### ${action.id} ${action.action_type}`);
    lines.push(`Policy result: ${action.policy_result}`);
    lines.push(`Policy rule: ${action.policy_rule_name || action.policy_rule} (${action.policy_rule})`);
    lines.push(`Resource: ${action.resource}`);
    lines.push(`Risk: ${action.risk}`);
    lines.push(`Before: ${action.before}`);
    lines.push(`After: ${action.after}`);
    lines.push(`Reasoning: ${action.reasoning}`);
    lines.push(`Rollback: ${action.rollback_note}`);
    lines.push(``);
  }

  lines.push(`## Approvals`, ``);
  if ((manifest.approvals || []).length === 0) {
    lines.push(`- None recorded`);
  } else {
    for (const approval of manifest.approvals) {
      lines.push(
        `- ${approval.id}: ${approval.status} by ${approval.actor} for ${approval.action_ids.join(", ")}`
      );
    }
  }

  lines.push(``, `## Execution`, ``);
  if (manifest.execution?.generated) {
    lines.push(
      `- Status: ${manifest.execution.status}`,
      `- Mode: ${manifest.execution.mode}`,
      `- Actor: ${manifest.execution.actor}`,
      `- Ledger: ${manifest.execution.markdown_path}`,
      `- Mock executed: ${manifest.execution.summary.mock_executed}`,
      `- Skipped unapproved: ${manifest.execution.summary.skipped_unapproved}`,
      `- Blocked: ${manifest.execution.summary.blocked}`
    );
  } else {
    lines.push(`- Not executed.`);
  }

  return `${lines.join("\n")}\n`;
}

function renderExecutionLedgerMarkdown(manifest, ledger) {
  const lines = [
    `# Plywood Execution Ledger`,
    ``,
    `Run: ${manifest.run.id}`,
    `Blueprint: ${manifest.blueprint.name}`,
    `Mode: ${ledger.mode}`,
    `Actor: ${ledger.actor}`,
    `Started: ${ledger.started_at}`,
    `Completed: ${ledger.completed_at}`,
    `Secrets shared with sandbox: ${ledger.secrets_shared_with_sandbox}`,
    ``,
    `## Summary`,
    ``,
    `- Mock executed: ${ledger.summary.mock_executed}`,
    `- Safe executed: ${ledger.summary.safe_executed}`,
    `- Approved executed: ${ledger.summary.approved_executed}`,
    `- Skipped unapproved: ${ledger.summary.skipped_unapproved}`,
    `- Blocked: ${ledger.summary.blocked}`,
    `- Total: ${ledger.summary.total}`,
    ``,
    `## Entries`,
    ``
  ];

  for (const entry of ledger.entries) {
    lines.push(`### ${entry.action_id} ${entry.action_type}`);
    lines.push(`Status: ${entry.status}`);
    lines.push(`Resource: ${entry.resource}`);
    lines.push(`Policy result: ${entry.policy_result}`);
    lines.push(`Policy rule: ${entry.policy_rule_name || entry.policy_rule} (${entry.policy_rule})`);
    if (entry.approval_id) {
      lines.push(`Approval: ${entry.approval_id}`);
    }
    lines.push(`Executor: ${entry.executor}`);
    lines.push(`Reason: ${entry.reason}`);
    lines.push(`Before: ${entry.before}`);
    lines.push(`After: ${entry.after}`);
    lines.push(`Rollback: ${entry.rollback_note}`);
    lines.push(
      `Broker: ${entry.broker_call.mode}, credential location ${entry.broker_call.credential_location}, secrets returned to sandbox ${entry.broker_call.secret_material_returned_to_sandbox}`
    );
    lines.push(``);
  }

  return `${lines.join("\n")}\n`;
}

function renderRollbackPlanMarkdown(manifest) {
  const reversibleActions = manifest.actions.filter((action) => action.policy_result !== "blocked");
  const blockedActions = manifest.actions.filter((action) => action.policy_result === "blocked");
  const lines = [
    `# Plywood Rollback Plan`,
    ``,
    `Run: ${manifest.run.id}`,
    `Blueprint: ${manifest.blueprint.name}`,
    ``,
    `## Reversible Proposed Actions`,
    ``
  ];

  for (const action of reversibleActions) {
    lines.push(`- ${action.id} ${action.action_type} on ${action.resource}: ${action.rollback_note}`);
  }

  lines.push(``, `## Blocked Actions`, ``);
  for (const action of blockedActions) {
    lines.push(`- ${action.id} ${action.action_type} was blocked before execution. ${action.rollback_note}`);
  }

  lines.push(
    ``,
    `## Operator Notes`,
    ``,
    `- Safe draft updates can be reverted from the before values in manifest.json.`,
    `- Approval-required actions should snapshot Shopify resource IDs before execution.`,
    `- Blocked actions must remain non-executable in this blueprint.`
  );

  return `${lines.join("\n")}\n`;
}

function buildRunLog(manifest) {
  const base = {
    run_id: manifest.run.id,
    target_environment: manifest.run.target_environment,
    safety_mode: manifest.run.safety_mode
  };

  return [
    {
      ...base,
      at: manifest.run.created_at,
      level: "info",
      event: "run.started",
      message: `${manifest.blueprint.name} started in mocked Docker SBX runtime.`
    },
    {
      ...base,
      at: manifest.run.created_at,
      level: "info",
      event: "sbx.secrets_policy",
      message: "Sandbox used brokered API access and did not receive raw Shopify secrets."
    },
    ...manifest.agents.map((agent) => ({
      ...base,
      at: manifest.run.created_at,
      level: "info",
      event: "agent.completed",
      agent_id: agent.id,
      message: `${agent.name} completed with toolkit: ${agent.toolkit.join(", ")}.`
    })),
    {
      ...base,
      at: manifest.run.created_at,
      level: "info",
      event: "policy.completed",
      message: `${manifest.policy_summary.safe} safe, ${manifest.policy_summary.needs_approval} needs approval, ${manifest.policy_summary.blocked} blocked.`
    }
  ];
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
