import fs from "node:fs";
import path from "node:path";
import { packageRoot } from "./paths.js";

const blueprintsRoot = path.join(packageRoot, "blueprints");

export function listBlueprints() {
  if (!fs.existsSync(blueprintsRoot)) {
    return [];
  }

  return fs
    .readdirSync(blueprintsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => loadBlueprint(entry.name))
    .filter(Boolean)
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function loadBlueprint(id) {
  const blueprintPath = path.join(blueprintsRoot, id, "blueprint.json");
  if (!fs.existsSync(blueprintPath)) {
    return null;
  }

  const raw = fs.readFileSync(blueprintPath, "utf8");
  return {
    ...JSON.parse(raw),
    path: blueprintPath
  };
}

export function requireBlueprint(id) {
  const blueprint = loadBlueprint(id);
  if (!blueprint) {
    const known = listBlueprints().map((item) => item.id).join(", ") || "none";
    throw new Error(`Unknown blueprint "${id}". Known blueprints: ${known}.`);
  }
  return blueprint;
}
