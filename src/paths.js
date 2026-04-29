import path from "node:path";
import { fileURLToPath } from "node:url";

const modulePath = fileURLToPath(import.meta.url);

export const packageRoot = path.resolve(path.dirname(modulePath), "..");

export function workspacePath(workspaceRoot, ...segments) {
  return path.resolve(workspaceRoot, ...segments);
}

export function toPosixPath(value) {
  return value.split(path.sep).join("/");
}
