import fs from "node:fs";
import path from "node:path";
import { packageRoot } from "./paths.js";
import { buildLegacySafetyPolicy, loadSafetyPolicy } from "./safety-policy.js";

const blueprintRoot = path.join(packageRoot, "blueprint");
const defaultBlueprintPath = path.join(blueprintRoot, "default.json");

export function listBlueprints() {
  const defaultBlueprint = loadDefaultBlueprint();
  if (!fs.existsSync(blueprintRoot)) {
    return defaultBlueprint ? [defaultBlueprint] : [];
  }

  const installed = fs
    .readdirSync(blueprintRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => loadBlueprint(entry.name))
    .filter(Boolean)
    .filter((blueprint) => blueprint.id !== defaultBlueprint?.id)
    .sort((left, right) => left.id.localeCompare(right.id));

  return defaultBlueprint ? [defaultBlueprint, ...installed] : installed;
}

export function loadBlueprint(id) {
  if (id === "default") {
    return loadDefaultBlueprint();
  }

  const defaultConfig = readDefaultBlueprintConfig();
  if (defaultConfig.id === id) {
    return hydrateBlueprint(defaultConfig, defaultBlueprintPath, blueprintRoot);
  }

  return loadBlueprintFromDirectory(id);
}

function loadBlueprintFromDirectory(id) {
  const blueprintPath = path.join(blueprintRoot, id, "blueprint.json");
  if (!fs.existsSync(blueprintPath)) {
    return null;
  }

  const raw = fs.readFileSync(blueprintPath, "utf8");
  return hydrateBlueprint(JSON.parse(raw), blueprintPath, path.dirname(blueprintPath));
}

export function getDefaultBlueprintId() {
  const config = readDefaultBlueprintConfig();
  if (config.id) {
    return config.id;
  }
  if (config.defaultBlueprint) {
    return config.defaultBlueprint;
  }

  throw new Error("Default blueprint config must include id.");
}

export function requireDefaultBlueprint() {
  const blueprint = loadDefaultBlueprint();
  if (!blueprint) {
    throw new Error("Default blueprint is not configured. Expected blueprint/default.json.");
  }
  return blueprint;
}

export function requireBlueprint(id) {
  const blueprint = loadBlueprint(id);
  if (!blueprint) {
    const known = listBlueprints().map((item) => item.id).join(", ") || "none";
    throw new Error(`Unknown blueprint "${id}". Known blueprints: ${known}.`);
  }
  return blueprint;
}

function loadDefaultBlueprint() {
  const config = readDefaultBlueprintConfig();
  if (config.defaultBlueprint && !config.id) {
    return loadBlueprintFromDirectory(config.defaultBlueprint);
  }

  return hydrateBlueprint(config, defaultBlueprintPath, blueprintRoot);
}

function readDefaultBlueprintConfig() {
  if (!fs.existsSync(defaultBlueprintPath)) {
    throw new Error("Default blueprint is not configured. Expected blueprint/default.json.");
  }

  return JSON.parse(fs.readFileSync(defaultBlueprintPath, "utf8"));
}

function hydrateBlueprint(config, blueprintPath, blueprintDir) {
  const blueprint = {
    ...config,
    path: blueprintPath
  };

  if (typeof config.safetyPolicy === "string" && config.safetyPolicy.trim()) {
    const policyPath = path.relative(packageRoot, path.resolve(blueprintDir, config.safetyPolicy));
    blueprint.safetyPolicy = loadSafetyPolicy(policyPath, packageRoot);
  } else if (config.policy && hasLegacyPolicyRules(config.policy)) {
    blueprint.safetyPolicy = buildLegacySafetyPolicy(config.policy, {
      id: `${config.id}.legacy`,
      name: `${config.name} Legacy Safety Policy`
    });
  }

  return blueprint;
}

function hasLegacyPolicyRules(policy) {
  return ["safe", "needsApproval", "blocked"].some((key) => Array.isArray(policy[key]) && policy[key].length > 0);
}
