import fs from "node:fs";
import path from "node:path";
import { packageRoot } from "./paths.js";

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
    return {
      ...defaultConfig,
      path: defaultBlueprintPath
    };
  }

  return loadBlueprintFromDirectory(id);
}

function loadBlueprintFromDirectory(id) {
  const blueprintPath = path.join(blueprintRoot, id, "blueprint.json");
  if (!fs.existsSync(blueprintPath)) {
    return null;
  }

  const raw = fs.readFileSync(blueprintPath, "utf8");
  return {
    ...JSON.parse(raw),
    path: blueprintPath
  };
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

  return {
    ...config,
    path: defaultBlueprintPath
  };
}

function readDefaultBlueprintConfig() {
  if (!fs.existsSync(defaultBlueprintPath)) {
    throw new Error("Default blueprint is not configured. Expected blueprint/default.json.");
  }

  return JSON.parse(fs.readFileSync(defaultBlueprintPath, "utf8"));
}
