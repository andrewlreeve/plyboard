import fs from "node:fs";
import path from "node:path";
import { packageRoot } from "./paths.js";

const blueprintRoot = path.join(packageRoot, "blueprint");
const defaultBlueprintPath = path.join(blueprintRoot, "default.json");

export function listBlueprints() {
  if (!fs.existsSync(blueprintRoot)) {
    return [];
  }

  return fs
    .readdirSync(blueprintRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => loadBlueprint(entry.name))
    .filter(Boolean)
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function loadBlueprint(id) {
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
  if (!fs.existsSync(defaultBlueprintPath)) {
    throw new Error("Default blueprint is not configured. Expected blueprint/default.json.");
  }

  const config = JSON.parse(fs.readFileSync(defaultBlueprintPath, "utf8"));
  if (!config.defaultBlueprint) {
    throw new Error("Default blueprint config must include defaultBlueprint.");
  }

  return config.defaultBlueprint;
}

export function requireDefaultBlueprint() {
  return requireBlueprint(getDefaultBlueprintId());
}

export function requireBlueprint(id) {
  const blueprint = loadBlueprint(id);
  if (!blueprint) {
    const known = listBlueprints().map((item) => item.id).join(", ") || "none";
    throw new Error(`Unknown blueprint "${id}". Known blueprints: ${known}.`);
  }
  return blueprint;
}
