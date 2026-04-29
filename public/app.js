const state = {
  blueprints: [],
  activeBlueprint: null,
  manifest: null,
  filter: "all",
  view: "console",
  busy: false,
  selectedActions: new Set(),
  contextStatus: null,
  contextFiles: [],
  selectedContextFilePath: null,
  contextDraft: "",
  contextDirty: false,
  exportResult: null,
  executionResult: null
};

const elements = {
  viewConsoleButton: document.querySelector("#view-console-button"),
  viewContextButton: document.querySelector("#view-context-button"),
  consoleView: document.querySelector("#console-view"),
  contextView: document.querySelector("#context-view"),
  blueprintSelect: document.querySelector("#blueprint-select"),
  contextInput: document.querySelector("#context-input"),
  actorInput: document.querySelector("#actor-input"),
  approvalNoteInput: document.querySelector("#approval-note-input"),
  runForm: document.querySelector("#run-form"),
  refreshButton: document.querySelector("#refresh-button"),
  runButton: document.querySelector("#run-button"),
  blueprintSummary: document.querySelector("#blueprint-summary"),
  approveButton: document.querySelector("#approve-button"),
  approveAllButton: document.querySelector("#approve-all-button"),
  executeButton: document.querySelector("#execute-button"),
  exportButton: document.querySelector("#export-button"),
  activityLog: document.querySelector("#activity-log"),
  activityState: document.querySelector("#activity-state"),
  runTitle: document.querySelector("#run-title"),
  runOverview: document.querySelector("#run-overview"),
  runStatus: document.querySelector("#run-status"),
  runMetadata: document.querySelector("#run-metadata"),
  mountList: document.querySelector("#mount-list"),
  mountSummary: document.querySelector("#mount-summary"),
  mountCount: document.querySelector("#mount-count"),
  safetyRuleCount: document.querySelector("#safety-rule-count"),
  safetyPolicySummary: document.querySelector("#safety-policy-summary"),
  safetyRuleList: document.querySelector("#safety-rule-list"),
  executionStatus: document.querySelector("#execution-status"),
  executionSummary: document.querySelector("#execution-summary"),
  executionList: document.querySelector("#execution-list"),
  contextSummary: document.querySelector("#context-summary"),
  contextStatusPill: document.querySelector("#context-status-pill"),
  productFindings: document.querySelector("#product-findings"),
  storefrontFindings: document.querySelector("#storefront-findings"),
  actionsList: document.querySelector("#actions-list"),
  actionCount: document.querySelector("#action-count"),
  productCount: document.querySelector("#product-count"),
  storefrontCount: document.querySelector("#storefront-count"),
  statBlueprint: document.querySelector("#stat-blueprint"),
  statRuntime: document.querySelector("#stat-runtime"),
  statSafe: document.querySelector("#stat-safe"),
  statApproval: document.querySelector("#stat-approval"),
  statDone: document.querySelector("#stat-done"),
  statBlocked: document.querySelector("#stat-blocked"),
  contextFileCount: document.querySelector("#context-file-count"),
  contextFileList: document.querySelector("#context-file-list"),
  newContextFileInput: document.querySelector("#new-context-file-input"),
  newContextFileButton: document.querySelector("#new-context-file-button"),
  contextEditorTitle: document.querySelector("#context-editor-title"),
  contextEditorMeta: document.querySelector("#context-editor-meta"),
  contextEditor: document.querySelector("#context-editor"),
  contextSaveState: document.querySelector("#context-save-state"),
  saveContextButton: document.querySelector("#save-context-button"),
  resetContextButton: document.querySelector("#reset-context-button"),
  findingTemplate: document.querySelector("#finding-template"),
  actionTemplate: document.querySelector("#action-template"),
  filterButtons: Array.from(document.querySelectorAll(".segment"))
};

boot().catch((error) => {
  logActivity(`Failed to initialize console: ${error.message}`, "blocked");
  setActivityState("Error", "blocked");
});

elements.viewConsoleButton.addEventListener("click", () => setView("console"));
elements.viewContextButton.addEventListener("click", () => setView("context"));
window.addEventListener("hashchange", () => {
  setView(readViewFromHash(), { syncHash: false });
});

elements.runForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const blueprintId = elements.blueprintSelect.value;
  const target = document.querySelector("#target-select").value;
  const safetyMode = document.querySelector("#safety-select").value;
  const extraInstructions = elements.contextInput.value.trim();

  try {
    setBusy(true);
    setActivityState("Running", "needs_approval");
    logActivity(
      `Starting ${selectedBlueprintName(blueprintId)} for ${formatTarget(target)} with ${formatSafetyMode(safetyMode)}.`,
      "needs_approval"
    );

    const { manifest } = await api("/api/runs", {
      method: "POST",
      body: {
        blueprintId,
        target,
        safetyMode,
        extraInstructions
      }
    });

    state.manifest = manifest;
    state.selectedActions.clear();
    state.exportResult = null;
    state.executionResult = null;

    if (manifest.blueprint?.id) {
      await loadBlueprintDetail(manifest.blueprint.id);
    }

    state.filter = suggestedFilter(manifest);
    render();
    setActivityState("Run Complete", "safe");
    logActivity(`Review complete: ${manifest.policy_summary.total} changes in the queue.`, "safe");
    setView("console");
  } catch (error) {
    setActivityState("Run Failed", "blocked");
    logActivity(error.message, "blocked");
  } finally {
    setBusy(false);
  }
});

elements.refreshButton.addEventListener("click", () => {
  refreshLatestRun();
});

elements.blueprintSelect.addEventListener("change", async () => {
  const blueprintId = elements.blueprintSelect.value;
  if (!blueprintId) {
    return;
  }

  try {
    await loadBlueprintDetail(blueprintId);
    render();
  } catch (error) {
    logActivity(error.message, "blocked");
  }
});

elements.approveButton.addEventListener("click", async () => {
  const actionIds = Array.from(state.selectedActions);
  if (actionIds.length === 0) {
    logActivity("Select one or more approval-gated actions first.", "needs_approval");
    return;
  }

  try {
    setBusy(true);
    setActivityState("Approving", "needs_approval");
    const result = await api("/api/approve", {
      method: "POST",
      body: {
        actionIds,
        actor: readOperatorActor(),
        note: readApprovalNote()
      }
    });

    state.manifest = result.manifest;
    state.selectedActions.clear();
    render();
    setActivityState("Approved", "safe");
    logActivity(`Approved ${result.approval.action_ids.length} selected change${result.approval.action_ids.length === 1 ? "" : "s"}.`, "safe");
  } catch (error) {
    setActivityState("Approval Failed", "blocked");
    logActivity(error.message, "blocked");
  } finally {
    setBusy(false);
  }
});

elements.approveAllButton.addEventListener("click", async () => {
  if (!state.manifest) {
    return;
  }

  try {
    setBusy(true);
    setActivityState("Approving", "needs_approval");
    const result = await api("/api/approve", {
      method: "POST",
      body: {
        allNeedsApproval: true,
        actor: readOperatorActor(),
        note: readApprovalNote() || "Approved all approval-gated actions from operator console"
      }
    });

    state.manifest = result.manifest;
    state.selectedActions.clear();
    render();
    setActivityState("Approved", "safe");
    logActivity("Approved all changes needing approval.", "safe");
  } catch (error) {
    setActivityState("Approval Failed", "blocked");
    logActivity(error.message, "blocked");
  } finally {
    setBusy(false);
  }
});

elements.executeButton.addEventListener("click", async () => {
  if (!state.manifest) {
    return;
  }

  try {
    setBusy(true);
    setActivityState("Executing", "needs_approval");
    const result = await api("/api/execute", {
      method: "POST",
      body: {
        actor: readOperatorActor()
      }
    });

    state.executionResult = result.execution;
    state.manifest = result.manifest;
    state.selectedActions.clear();
    state.filter = suggestedFilter(result.manifest);
    render();
    setActivityState("Executed", "safe");
    logActivity(
      `Run receipt recorded ${result.execution.summary.mock_executed} completed changes.`,
      "safe"
    );
  } catch (error) {
    setActivityState("Run Failed", "blocked");
    logActivity(error.message, "blocked");
  } finally {
    setBusy(false);
  }
});

elements.exportButton.addEventListener("click", async () => {
  if (!state.manifest) {
    return;
  }

  try {
    setBusy(true);
    setActivityState("Exporting", "neutral");
    const outDir = prompt("Export folder", `exports/gui-${state.manifest.run.id}`) || "";
    const result = await api("/api/export-audit", {
      method: "POST",
      body: { outDir }
    });

    state.exportResult = result;
    render();
    setActivityState("Exported", "safe");
    logActivity(`Audit packet exported to ${result.exported_to}.`, "safe");
  } catch (error) {
    setActivityState("Export Failed", "blocked");
    logActivity(error.message, "blocked");
  } finally {
    setBusy(false);
  }
});

for (const button of elements.filterButtons) {
  button.addEventListener("click", () => {
    state.filter = button.dataset.filter;
    renderFilters();
    renderActions();
  });
}

elements.contextEditor.addEventListener("input", () => {
  state.contextDraft = elements.contextEditor.value;
  state.contextDirty = state.contextDraft !== getSelectedContextFile()?.contents;
  renderContextDashboard();
});

elements.contextFileList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-context-file]");
  if (!button) {
    return;
  }

  const nextPath = button.dataset.contextFile;
  if (!nextPath || nextPath === state.selectedContextFilePath) {
    return;
  }

  if (state.contextDirty && !confirm("Discard unsaved context changes?")) {
    return;
  }

  selectContextFile(nextPath);
});

elements.newContextFileButton.addEventListener("click", async () => {
  const rawName = elements.newContextFileInput.value.trim();
  if (!rawName) {
    logActivity("Enter a file name such as brand-voice.md.", "needs_approval");
    return;
  }

  const fileName = rawName.includes(".") ? rawName : `${rawName}.md`;
  if (state.contextFiles.some((file) => file.path === fileName)) {
    logActivity(`Instruction file ${fileName} already exists.`, "needs_approval");
    selectContextFile(fileName);
    return;
  }

  try {
    setBusy(true);
    setActivityState("Saving Context", "needs_approval");
    const starter = buildContextStarter(fileName);
    await api(`/api/context/files/${encodeURIComponent(fileName)}`, {
      method: "PUT",
      body: { contents: starter }
    });

    await refreshContextFiles({ selectPath: fileName });
    elements.newContextFileInput.value = "";
    setView("context");
    setActivityState("Ready", "safe");
    logActivity(`Created instruction file ${fileName}.`, "safe");
  } catch (error) {
    setActivityState("Context Save Failed", "blocked");
    logActivity(error.message, "blocked");
  } finally {
    setBusy(false);
  }
});

elements.saveContextButton.addEventListener("click", async () => {
  const selected = getSelectedContextFile();
  if (!selected) {
    return;
  }

  try {
    setBusy(true);
    setActivityState("Saving Context", "needs_approval");
    const result = await api(`/api/context/files/${encodeURIComponent(selected.path)}`, {
      method: "PUT",
      body: { contents: state.contextDraft }
    });

    state.contextStatus = result.context;
    await refreshContextFiles({ selectPath: selected.path });
    setActivityState("Ready", "safe");
    logActivity(`Saved instructions in ${selected.path}.`, "safe");
  } catch (error) {
    setActivityState("Context Save Failed", "blocked");
    logActivity(error.message, "blocked");
  } finally {
    setBusy(false);
  }
});

elements.resetContextButton.addEventListener("click", () => {
  const selected = getSelectedContextFile();
  if (!selected) {
    return;
  }

  state.contextDraft = selected.contents;
  state.contextDirty = false;
  renderContextDashboard();
  logActivity(`Reset unsaved changes for ${selected.path}.`, "neutral");
});

async function boot() {
  setActivityState("Loading", "neutral");
  logActivity("Loading blueprints, shared instructions, and the latest run.", "neutral");

  const [blueprints, contextStatus, contextFiles, manifest] = await Promise.all([
    api("/api/blueprints"),
    api("/api/context"),
    loadContextFiles(),
    loadLatestManifest()
  ]);

  state.blueprints = blueprints;
  state.contextStatus = contextStatus;
  state.contextFiles = contextFiles.files;
  state.manifest = manifest;
  state.filter = suggestedFilter(manifest);
  populateBlueprints();

  if (state.manifest?.blueprint?.id) {
    await loadBlueprintDetail(state.manifest.blueprint.id);
  } else {
    const operatorBlueprint = state.blueprints.find((blueprint) => blueprint.id === "product-readiness-qa") || state.blueprints[0];
    if (operatorBlueprint?.id) {
      await loadBlueprintDetail(operatorBlueprint.id);
    }
  }

  if (state.contextFiles[0]) {
    selectContextFile(state.contextFiles[0].path, { renderNow: false });
  }

  setView(readViewFromHash(), { syncHash: false });
  render();
  setActivityState("Ready", "safe");
  logActivity("Console ready.", "safe");
}

async function refreshLatestRun() {
  try {
    setBusy(true);
    setActivityState("Refreshing", "neutral");
    logActivity("Refreshing the latest review.", "neutral");
    state.manifest = await loadLatestManifest();
    state.selectedActions.clear();
    state.executionResult = null;

    if (state.manifest?.blueprint?.id) {
      await loadBlueprintDetail(state.manifest.blueprint.id);
    }

    render();
    setActivityState("Ready", "safe");
  } catch (error) {
    setActivityState("Refresh Failed", "blocked");
    logActivity(error.message, "blocked");
  } finally {
    setBusy(false);
  }
}

async function refreshContextFiles({ selectPath = state.selectedContextFilePath } = {}) {
  const files = await loadContextFiles();
  state.contextFiles = files.files;
  state.contextStatus = await api("/api/context");

  if (state.contextFiles.length === 0) {
    state.selectedContextFilePath = null;
    state.contextDraft = "";
    state.contextDirty = false;
    render();
    return;
  }

  const nextFile = state.contextFiles.find((file) => file.path === selectPath) || state.contextFiles[0];
  selectContextFile(nextFile.path, { renderNow: false });
  render();
}

async function loadContextFiles() {
  return api("/api/context/files");
}

async function loadLatestManifest() {
  try {
    return await api("/api/runs/latest");
  } catch (error) {
    if (error.status === 404) {
      return null;
    }
    throw error;
  }
}

async function loadBlueprintDetail(id) {
  state.activeBlueprint = await api(`/api/blueprints/${encodeURIComponent(id)}`);
  if (id) {
    elements.blueprintSelect.value = id;
  }
}

function populateBlueprints() {
  elements.blueprintSelect.innerHTML = "";
  const workflowBlueprints = selectableBlueprints();
  for (const blueprint of workflowBlueprints) {
    const option = document.createElement("option");
    option.value = blueprint.id;
    option.textContent = blueprint.name;
    elements.blueprintSelect.append(option);
  }

  if (state.activeBlueprint?.id) {
    elements.blueprintSelect.value = state.activeBlueprint.id;
  }
}

function selectableBlueprints() {
  const runnable = state.blueprints.filter((blueprint) => blueprint.id !== "default");
  return runnable.length > 0 ? runnable : state.blueprints;
}

function selectContextFile(filePath, { renderNow = true } = {}) {
  const file = state.contextFiles.find((entry) => entry.path === filePath) || null;
  state.selectedContextFilePath = file?.path || null;
  state.contextDraft = file?.contents || "";
  state.contextDirty = false;
  if (renderNow) {
    renderContextDashboard();
  }
}

function getSelectedContextFile() {
  return state.contextFiles.find((file) => file.path === state.selectedContextFilePath) || null;
}

function render() {
  renderView();
  renderContext();
  renderSummary();
  renderExecution();
  renderFindings();
  renderActions();
  renderFilters();
  renderContextDashboard();
}

function renderView() {
  const isConsole = state.view === "console";
  elements.consoleView.classList.toggle("active", isConsole);
  elements.contextView.classList.toggle("active", !isConsole);
  elements.viewConsoleButton.classList.toggle("active", isConsole);
  elements.viewContextButton.classList.toggle("active", !isConsole);
}

function renderContext() {
  const context = state.contextStatus;
  elements.contextSummary.innerHTML = "";

  if (!context) {
    elements.contextStatusPill.textContent = "Unavailable";
    elements.contextStatusPill.className = "pill blocked";
    return;
  }

  elements.contextStatusPill.textContent = context.exists ? "Ready" : "Missing";
  elements.contextStatusPill.className = `pill ${context.exists ? "safe" : "needs_approval"}`;

  const items = context.exists
    ? [
        "Standard guidance ready.",
        `${context.file_count} instruction file${context.file_count === 1 ? "" : "s"}.`
      ]
    : ["No shared guidance found."];

  for (const item of items) {
    const div = document.createElement("div");
    div.textContent = item;
    elements.contextSummary.append(div);
  }
}

function renderSummary() {
  const manifest = state.manifest;
  const blueprint = manifest ? manifest.blueprint : state.activeBlueprint;

  elements.statBlueprint.textContent = blueprint?.name || "Waiting";
  elements.statRuntime.textContent = state.activeBlueprint?.description || "Choose a review to begin.";
  elements.blueprintSummary.textContent = activeBlueprintSummary();

  if (!manifest) {
    elements.runTitle.textContent = state.activeBlueprint?.name || "Choose a review";
    elements.runOverview.textContent =
      state.activeBlueprint?.description || "Start a review to see findings and recommended changes.";
    elements.runStatus.textContent = "Awaiting run";
    elements.runStatus.className = "pill neutral";
    elements.runMetadata.innerHTML = "";
    renderMountList(
      state.activeBlueprint?.contextMounts?.defaultLocalPath
        ? [
            {
              source_path: state.activeBlueprint.contextMounts.defaultLocalPath,
              sandbox_path: state.activeBlueprint.contextMounts.defaultSandboxPath,
              mount_role: "default"
            }
          ]
        : []
    );
    renderSafetyPolicy(currentSafetyPolicy());
    elements.statSafe.textContent = "0";
    elements.statApproval.textContent = "0";
    elements.statDone.textContent = "0";
    elements.statBlocked.textContent = "0";
    return;
  }

  elements.runTitle.textContent = manifest.blueprint.name;
  elements.runOverview.textContent = buildRunOverview(manifest);
  elements.runStatus.textContent = manifest.run.status;
  elements.runStatus.className = "pill safe";
  const decisionSummary = summarizeDecisions(manifest.actions || []);
  elements.statSafe.textContent = String(decisionSummary.ready);
  elements.statApproval.textContent = String(decisionSummary.needsApproval);
  elements.statDone.textContent = String(decisionSummary.done);
  elements.statBlocked.textContent = String(decisionSummary.blocked);

  const metadata = [
    ["Store", formatTarget(manifest.run.target_environment)],
    ["Review Setting", formatSafetyMode(manifest.run.safety_mode)],
    ["Started", formatTimestamp(manifest.run.created_at)],
    ["Approved", String((manifest.approvals || []).length)]
  ];

  if (state.exportResult?.exported_to) {
    metadata.push(["Last Export", state.exportResult.exported_to]);
  }

  renderSummaryItems(elements.runMetadata, metadata);

  renderMountList(manifest.sbx.mounted_context || []);
  renderSafetyPolicy(currentSafetyPolicy());
}

function renderSummaryItems(container, items) {
  container.innerHTML = "";
  for (const [label, value] of items) {
    const wrapper = document.createElement("dl");
    wrapper.className = "summary-item";
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value;
    wrapper.append(dt, dd);
    container.append(wrapper);
  }
}

function activeBlueprintSummary() {
  if (!state.activeBlueprint) {
    return "Choose an agent blueprint and store target.";
  }

  const agentCount = Array.isArray(state.activeBlueprint.agents) ? state.activeBlueprint.agents.length : 0;
  const agentLabel = agentCount === 1 ? "agent" : "agents";
  return `${state.activeBlueprint.name} uses ${agentCount} ${agentLabel} and the selected change level.`;
}

function renderExecution() {
  const manifest = state.manifest;
  const execution = manifest?.execution;
  elements.executionSummary.innerHTML = "";
  elements.executionList.innerHTML = "";

  if (!manifest) {
    elements.executionStatus.textContent = "Not run";
    elements.executionStatus.className = "pill neutral";
    elements.executionList.textContent = "No run receipt yet.";
    elements.executionList.classList.add("empty-state");
    return;
  }

  if (!execution?.generated) {
    const counts = countExecutableActions(manifest.actions || []);
    elements.executionStatus.textContent = "Not run";
    elements.executionStatus.className = "pill neutral";
    renderSummaryItems(elements.executionSummary, [
      ["Ready to run", String(counts.executable)],
      ["Needs approval", String(counts.unapproved)],
      ["Blocked", String(counts.blocked)],
      ["Last run", "Not run"]
    ]);
    elements.executionList.textContent = "No ledger entries recorded.";
    elements.executionList.classList.add("empty-state");
    return;
  }

  elements.executionStatus.textContent = "Completed";
  elements.executionStatus.className = "pill safe";
  renderSummaryItems(elements.executionSummary, [
    ["Ran", String(execution.summary.mock_executed)],
    ["Skipped", String(execution.summary.skipped_unapproved)],
    ["Blocked", String(execution.summary.blocked)],
    ["Receipt", execution.path]
  ]);

  const entries = (manifest.actions || []).filter((action) => action.execution);
  if (entries.length === 0) {
    elements.executionList.textContent = "Run receipt saved without change rows.";
    elements.executionList.classList.add("empty-state");
    return;
  }

  elements.executionList.classList.remove("empty-state");
  for (const action of entries) {
    const row = document.createElement("article");
    row.className = "execution-row";

    const head = document.createElement("div");
    head.className = "execution-row-head";

    const title = document.createElement("strong");
    title.textContent = `${action.id} ${formatActionType(action.action_type)}`;

    const status = document.createElement("span");
    status.className = `pill ${executionStatusClass(action.execution.status)}`;
    status.textContent = formatExecutionStatus(action.execution.status);

    head.append(title, status);

    const meta = document.createElement("p");
    meta.textContent = action.resource;

    const reason = document.createElement("p");
    reason.textContent = action.execution.reason;

    row.append(head, meta, reason);
    elements.executionList.append(row);
  }
}

function renderFindings() {
  const manifest = state.manifest;
  const products = manifest?.product_findings || [];
  const storefront = manifest?.storefront_findings || [];

  elements.productCount.textContent = `${products.length} product${products.length === 1 ? "" : "s"}`;
  elements.storefrontCount.textContent = `${storefront.length} audit${storefront.length === 1 ? "" : "s"}`;

  renderFindingList(elements.productFindings, products, "title");
  renderFindingList(elements.storefrontFindings, storefront, "area");
}

function renderFindingList(container, findings, titleKey) {
  container.innerHTML = "";
  if (findings.length === 0) {
    container.textContent = "No findings available.";
    container.classList.add("empty-state");
    return;
  }

  container.classList.remove("empty-state");

  for (const finding of findings) {
    const fragment = elements.findingTemplate.content.cloneNode(true);
    fragment.querySelector(".finding-title").textContent = finding[titleKey];
    fragment.querySelector(".finding-summary").textContent = finding.summary;

    const severity = fragment.querySelector(".finding-severity");
    severity.textContent = finding.severity;
    severity.className = `pill finding-severity ${riskClass(finding.severity)}`;

    const checklist = fragment.querySelector(".check-list");
    for (const check of finding.checks) {
      const item = document.createElement("li");
      item.textContent = `${check.name}: ${check.result} - ${check.detail}`;
      checklist.append(item);
    }

    container.append(fragment);
  }
}

function renderActions() {
  const manifest = state.manifest;
  const actions = filterActions(manifest?.actions || []);

  elements.actionsList.innerHTML = "";
  elements.actionCount.textContent = `${actions.length} change${actions.length === 1 ? "" : "s"}`;

  if (actions.length === 0) {
    elements.actionsList.textContent = manifest
      ? "No changes match this view."
      : "No changes yet.";
    elements.actionsList.classList.add("empty-state");
    updateActionButtons();
    return;
  }

  elements.actionsList.classList.remove("empty-state");

  for (const action of actions) {
    const fragment = elements.actionTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".action-card");
    const details = fragment.querySelector(".action-details");
    const select = fragment.querySelector(".action-select");
    const checkbox = fragment.querySelector(".action-checkbox");
    const isSelectable = action.policy_result === "needs_approval" && !action.approval;

    checkbox.disabled = !isSelectable;
    checkbox.checked = state.selectedActions.has(action.id);
    details.open = action.policy_result === "needs_approval" && !action.approval;

    const syncSelectedState = () => {
      select.classList.toggle("action-select-hidden", !isSelectable);
      card.classList.toggle("action-card-selectable", isSelectable);
      card.classList.toggle("action-card-selected", checkbox.checked);
      card.classList.toggle("action-card-static", !isSelectable);
      card.classList.toggle("action-card-disabled", !isSelectable);
    };

    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        state.selectedActions.add(action.id);
      } else {
        state.selectedActions.delete(action.id);
      }
      syncSelectedState();
      updateActionButtons();
    });

    fragment.querySelector(".action-id").textContent = action.id;
    fragment.querySelector(".action-type").textContent = formatActionType(action.action_type);
    fragment.querySelector(".action-resource").textContent = action.resource;

    const displayStatus = actionDisplayStatus(action);
    const policy = fragment.querySelector(".action-policy");
    policy.textContent = displayStatus.label;
    policy.className = `pill action-policy ${displayStatus.tone}`;

    const risk = fragment.querySelector(".action-risk");
    risk.textContent = action.risk;
    risk.className = `pill action-risk ${riskClass(action.risk)}`;

    const metaItems = [
      `<span>Checked by ${formatAgentName(action.agent_id)}</span>`
    ];
    if (action.approval) {
      metaItems.push(`<span>Approved by ${action.approval.actor}</span>`);
    }
    if (action.execution) {
      metaItems.push(`<span>Run status: ${formatExecutionStatus(action.execution.status)}</span>`);
    }
    fragment.querySelector(".action-meta").innerHTML = metaItems.join("");

    fragment.querySelector(".action-before").textContent = action.before;
    fragment.querySelector(".action-after").textContent = action.after;
    fragment.querySelector(".action-reasoning").textContent = summarizeActionReason(action);

    const rollbackText = action.approval
      ? `Rollback plan: ${action.rollback_note} Approved by ${action.approval.actor} on ${formatTimestamp(action.approval.approved_at)}.`
      : `Rollback plan: ${action.rollback_note}`;
    fragment.querySelector(".action-rollback").textContent = rollbackText;

    syncSelectedState();

    elements.actionsList.append(fragment);
  }

  updateActionButtons();
}

function renderContextDashboard() {
  const files = state.contextFiles;
  const selected = getSelectedContextFile();

  elements.contextFileCount.textContent = `${files.length} file${files.length === 1 ? "" : "s"}`;
  elements.contextFileList.innerHTML = "";

  if (files.length === 0) {
    elements.contextFileList.textContent = "No instruction files yet.";
    elements.contextFileList.classList.add("empty-state");
  } else {
    elements.contextFileList.classList.remove("empty-state");
    for (const file of files) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `context-file-item${file.path === state.selectedContextFilePath ? " active" : ""}`;
      button.dataset.contextFile = file.path;
      button.innerHTML = `
        <strong>${file.path}</strong>
        <span>${file.bytes} bytes</span>
        <span>${formatTimestamp(file.updated_at)}</span>
      `;
      elements.contextFileList.append(button);
    }
  }

  if (!selected) {
    elements.contextEditorTitle.textContent = "Choose a file";
    elements.contextEditorMeta.innerHTML = "";
    elements.contextEditor.value = "";
    elements.contextEditor.disabled = true;
    elements.saveContextButton.disabled = true;
    elements.resetContextButton.disabled = true;
    elements.contextSaveState.textContent = "Ready";
    elements.contextSaveState.className = "pill neutral";
    return;
  }

  elements.contextEditorTitle.textContent = selected.path;
  elements.contextEditorMeta.innerHTML = "";

  const meta = [
    ["Instruction File", selected.path],
    ["Used By", "Every agent run in this workspace"],
    ["Size", `${selected.bytes} bytes`],
    ["Updated", formatTimestamp(selected.updated_at)]
  ];

  for (const [label, value] of meta) {
    const wrapper = document.createElement("dl");
    wrapper.className = "summary-item";
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value;
    wrapper.append(dt, dd);
    elements.contextEditorMeta.append(wrapper);
  }

  if (elements.contextEditor.value !== state.contextDraft) {
    elements.contextEditor.value = state.contextDraft;
  }

  elements.contextEditor.disabled = false;
  elements.saveContextButton.disabled = state.busy || !state.contextDirty;
  elements.resetContextButton.disabled = state.busy || !state.contextDirty;
  elements.contextSaveState.textContent = state.contextDirty ? "Unsaved" : "Saved";
  elements.contextSaveState.className = `pill ${state.contextDirty ? "needs_approval" : "safe"}`;
}

function renderFilters() {
  for (const button of elements.filterButtons) {
    button.classList.toggle("active", button.dataset.filter === state.filter);
  }
}

function filterActions(actions) {
  if (state.filter === "all") {
    return actions;
  }
  const filter = state.filter === "safe" ? "ready" : state.filter;
  return actions.filter((action) => actionQueueState(action) === filter);
}

function summarizeDecisions(actions) {
  const summary = {
    ready: 0,
    needsApproval: 0,
    done: 0,
    blocked: 0
  };

  for (const action of actions) {
    const state = actionQueueState(action);
    if (state === "done") {
      summary.done += 1;
    } else if (state === "blocked") {
      summary.blocked += 1;
    } else if (state === "needs_approval") {
      summary.needsApproval += 1;
    } else {
      summary.ready += 1;
    }
  }

  return summary;
}

function actionQueueState(action) {
  if (action.execution?.status === "mock_executed") {
    return "done";
  }

  if (action.policy_result === "blocked" || action.execution?.status === "blocked") {
    return "blocked";
  }

  if (action.policy_result === "needs_approval" && !action.approval) {
    return "needs_approval";
  }

  return "ready";
}

function updateActionButtons() {
  const manifest = state.manifest;
  const approvalCandidates = (manifest?.actions || []).filter(
    (action) => action.policy_result === "needs_approval" && !action.approval
  );
  const executable = countExecutableActions(manifest?.actions || []);

  elements.approveButton.disabled = state.busy || state.selectedActions.size === 0;
  elements.approveAllButton.disabled = state.busy || approvalCandidates.length === 0;
  elements.executeButton.disabled = state.busy || !manifest || executable.executable === 0;
  elements.exportButton.disabled = state.busy || !manifest;
}

function countExecutableActions(actions) {
  const counts = {
    executable: 0,
    unapproved: 0,
    blocked: 0,
    done: 0
  };

  for (const action of actions) {
    const state = actionQueueState(action);
    if (state === "blocked") {
      counts.blocked += 1;
    } else if (state === "needs_approval") {
      counts.unapproved += 1;
    } else if (state === "done") {
      counts.done += 1;
    } else {
      counts.executable += 1;
    }
  }

  return counts;
}

function setBusy(isBusy) {
  state.busy = isBusy;
  elements.runButton.disabled = isBusy;
  elements.refreshButton.disabled = isBusy;
  elements.newContextFileButton.disabled = isBusy;
  elements.contextEditor.disabled = isBusy || !getSelectedContextFile();
  updateActionButtons();
  renderContextDashboard();
}

function setActivityState(label, tone) {
  elements.activityState.textContent = label;
  elements.activityState.className = `pill ${tone || "neutral"}`;
}

function setView(view, { syncHash = true } = {}) {
  state.view = view === "context" ? "context" : "console";
  if (syncHash) {
    const nextHash = state.view === "context" ? "#context" : "#console";
    if (window.location.hash !== nextHash) {
      history.replaceState(null, "", nextHash);
    }
  }
  renderView();
}

function readViewFromHash() {
  return window.location.hash === "#context" ? "context" : "console";
}

function logActivity(message, tone = "neutral") {
  const item = document.createElement("li");
  item.textContent = `${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}  ${message}`;
  item.dataset.tone = tone;
  elements.activityLog.prepend(item);

  while (elements.activityLog.children.length > 8) {
    elements.activityLog.removeChild(elements.activityLog.lastChild);
  }
}

function readOperatorActor() {
  return elements.actorInput.value.trim() || "gui-operator";
}

function readApprovalNote() {
  return elements.approvalNoteInput.value.trim();
}

function formatPolicy(policy) {
  return (
    {
      safe: "Ready",
      needs_approval: "Needs approval",
      blocked: "Blocked"
    }[policy] || policy.replace(/_/g, " ")
  );
}

function actionDisplayStatus(action) {
  if (action.execution?.status === "mock_executed") {
    return { label: "Ran", tone: "done" };
  }

  if (action.approval) {
    return { label: "Approved", tone: "safe" };
  }

  if (action.execution?.status === "blocked") {
    return { label: "Blocked", tone: "blocked" };
  }

  if (action.execution?.status === "skipped_unapproved") {
    return { label: "Needs approval", tone: "needs_approval" };
  }

  return {
    label: formatPolicy(action.policy_result),
    tone: action.policy_result
  };
}

function formatExecutionStatus(status) {
  return (
    {
      mock_executed: "Ran",
      skipped_unapproved: "Skipped",
      blocked: "Blocked"
    }[status] || status.replace(/_/g, " ")
  );
}

function executionStatusClass(status) {
  return (
    {
      mock_executed: "done",
      skipped_unapproved: "needs_approval",
      blocked: "blocked"
    }[status] || "neutral"
  );
}

function formatRuleMatch(match) {
  if (!match || typeof match !== "object") {
    return "match: any";
  }

  return Object.entries(match)
    .map(([key, value]) => `${key}: ${formatRuleMatchValue(value)}`)
    .join(" | ");
}

function formatRuleMatchValue(value) {
  if (Array.isArray(value)) {
    return value.join(", ");
  }

  if (value && typeof value === "object") {
    return `{ ${formatRuleMatch(value)} }`;
  }

  return String(value);
}

function riskClass(value) {
  return ["low", "medium", "high", "critical"].includes(value) ? value : "neutral";
}

function renderMountList(mounts) {
  elements.mountList.innerHTML = "";
  elements.mountCount.textContent = `${mounts.length} file${mounts.length === 1 ? "" : "s"}`;

  if (mounts.length === 0) {
    elements.mountSummary.textContent = "No shared guidance was recorded for this review.";
    elements.mountList.classList.remove("empty-state");
    return;
  }

  const defaultMounts = mounts.filter((mount) => mount.mount_role === "default").length;
  const extraMounts = mounts.length - defaultMounts;

  if (defaultMounts > 0 && extraMounts > 0) {
    elements.mountSummary.textContent = `This review used your standard guidance and ${extraMounts} extra note${extraMounts === 1 ? "" : "s"}.`;
  } else if (defaultMounts > 0) {
    elements.mountSummary.textContent = "This review used your standard guidance.";
  } else {
    elements.mountSummary.textContent = `This review used ${mounts.length} extra note${mounts.length === 1 ? "" : "s"}.`;
  }

  for (const mount of mounts) {
    const tag = document.createElement("span");
    tag.className = "simple-tag";
    tag.textContent = formatMountName(mount.source_path);
    elements.mountList.append(tag);
  }
}

function renderSafetyPolicy(policy) {
  elements.safetyRuleList.innerHTML = "";

  if (!policy) {
    elements.safetyRuleCount.textContent = "No policy";
    elements.safetyRuleCount.className = "pill blocked";
    elements.safetyPolicySummary.textContent = "No structured host-side safety policy is attached to this blueprint.";
    elements.safetyRuleList.classList.add("empty-state");
    elements.safetyRuleList.textContent = "Actions default to review when no policy is available.";
    return;
  }

  const rules = Array.isArray(policy.rules) ? policy.rules : [];
  elements.safetyRuleCount.textContent = `${rules.length} rule${rules.length === 1 ? "" : "s"}`;
  elements.safetyRuleCount.className = "pill safe";
  elements.safetyPolicySummary.textContent = `${policy.name} classifies actions from ${policy.path || "the active blueprint"}. Default: ${formatPolicy(policy.default_result)}.`;
  elements.safetyRuleList.classList.remove("empty-state");

  for (const rule of rules) {
    const card = document.createElement("div");
    card.className = "safety-rule-card";

    const head = document.createElement("div");
    head.className = "safety-rule-head";

    const title = document.createElement("strong");
    title.textContent = rule.name;

    const pill = document.createElement("span");
    pill.className = `pill ${rule.result}`;
    pill.textContent = formatPolicy(rule.result);

    head.append(title, pill);

    const reason = document.createElement("p");
    reason.textContent = rule.reason;

    const match = document.createElement("code");
    match.textContent = formatRuleMatch(rule.match);

    card.append(head, reason, match);
    elements.safetyRuleList.append(card);
  }
}

function currentSafetyPolicy() {
  return state.manifest?.safety_policy || state.activeBlueprint?.safetyPolicy || null;
}

function formatTimestamp(value) {
  if (!value) {
    return "Unknown";
  }
  return new Date(value).toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function buildContextStarter(fileName) {
  const heading = fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
  return `# ${heading}\n\n- Add the instructions you want every agent to follow.\n- Be specific about brand voice, merchandising standards, approval preferences, or product rules.\n`;
}

function formatMountName(sourcePath) {
  if (sourcePath === ".plywood/gui-inputs/review-instructions.md") {
    return "Notes for this review";
  }
  if (sourcePath === "context") {
    return "Standard brand guidance";
  }
  return sourcePath.replace(/^context\//, "");
}

function buildRunOverview(manifest) {
  const parts = [];
  const summary = summarizeDecisions(manifest.actions || []);

  if (summary.needsApproval > 0) {
    parts.push(
      `${summary.needsApproval} change${summary.needsApproval === 1 ? " needs" : "s need"} approval`
    );
  }

  if (summary.ready > 0) {
    parts.push(`${summary.ready} ${summary.ready === 1 ? "is" : "are"} ready`);
  }

  if (summary.done > 0) {
    parts.push(`${summary.done} ${summary.done === 1 ? "has" : "have"} run`);
  }

  if (summary.blocked > 0) {
    parts.push(
      `${summary.blocked} change${summary.blocked === 1 ? "" : "s"} ${summary.blocked === 1 ? "is" : "are"} blocked`
    );
  }

  if (parts.length === 0) {
    return "No recommended changes were recorded for this review.";
  }

  return `${parts.join(". ")}.`;
}

function suggestedFilter(manifest) {
  if (!manifest) {
    return "all";
  }
  const summary = summarizeDecisions(manifest.actions || []);
  if (summary.needsApproval > 0) {
    return "needs_approval";
  }
  if (summary.ready > 0) {
    return "ready";
  }
  if (summary.blocked > 0) {
    return "blocked";
  }
  if (summary.done > 0) {
    return "done";
  }
  return "all";
}

function formatActionType(actionType) {
  return (
    {
      "product.read": "Review Product",
      "product.enrichment_draft": "Draft Product Copy",
      "product.seo_draft": "Draft SEO Update",
      "product.image_alt_text_draft": "Draft Alt Text",
      "product.media_issue_flag": "Flag Media Issue",
      "product.publish_readiness_check": "Check Publish Readiness",
      "storefront.product_quality_audit": "Audit Storefront Product",
      "collection.merchandising_recommendation": "Merchandising Recommendation",
      "product.publish": "Publish Product",
      "product.publish.ready": "Mark Ready To Publish",
      "collection.publish": "Publish Collection",
      "collection.sort_update": "Reorder Collection",
      "product.update_price": "Update Price",
      "inventory.update": "Update Inventory",
      "product.media_delete": "Delete Product Media",
      "inventory.decrement": "Reduce Inventory",
      "theme.publish.production": "Publish Storefront Theme",
      "customer.email_send": "Send Customer Email",
      "payment.capture": "Capture Payment",
      "refund.create": "Create Refund",
      "admin_user.create": "Create Admin User",
      "webhook.create": "Create Webhook"
    }[actionType] ||
    actionType
      .replace(/[._]/g, " ")
      .replace(/\b\w/g, (match) => match.toUpperCase())
  );
}

function formatAgentName(agentId) {
  return (
    {
      "catalog-qa": "Catalog QA",
      "storefront-merchandising": "Storefront Merchandising"
    }[agentId] || agentId.replace(/[-_]/g, " ").replace(/\b\w/g, (match) => match.toUpperCase())
  );
}

function summarizeActionReason(action) {
  if (action.policy_result === "needs_approval") {
    return "Needs review because it affects pricing, inventory, publish state, or the live storefront.";
  }

  if (action.policy_result === "blocked") {
    return "Blocked because this workflow does not allow that kind of change.";
  }

  if (action.policy_result === "safe") {
    return "Ready because this step is read-only, draft-only, or advisory.";
  }

  return action.reasoning;
}

function selectedBlueprintName(blueprintId) {
  return state.blueprints.find((blueprint) => blueprint.id === blueprintId)?.name || "the selected review";
}

function formatTarget(value) {
  return (
    {
      demo: "Demo store",
      dev: "Development store",
      staging: "Staging store",
      production: "Production store"
    }[value] || value
  );
}

function formatSafetyMode(value) {
  return (
    {
      "read-only": "Review only",
      "draft-only": "Allow draft updates",
      "staging-write": "Allow staging updates",
      "production-requires-approval": "Require approval for production changes"
    }[value] || value
  );
}

async function api(url, { method = "GET", body } = {}) {
  const response = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `Request failed with status ${response.status}.`);
    error.status = response.status;
    throw error;
  }
  return payload;
}
