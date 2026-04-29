import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const SECRET_FILE_PATTERNS = [
  /^\.env($|\.)/i,
  /secret/i,
  /credential/i,
  /private[-_]?key/i,
  /\.pem$/i,
  /\.key$/i,
  /\.p12$/i,
  /\.pfx$/i
];

const IGNORED_DIRS = new Set([".git", "node_modules", "runs", ".plyboard", "exports"]);

export function resolveContextMounts(inputs, workspaceRoot) {
  return inputs.map((input) => resolveContextMount(input, workspaceRoot));
}

function resolveContextMount(input, workspaceRoot) {
  const absolutePath = path.resolve(workspaceRoot, String(input));
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Context mount does not exist: ${input}`);
  }

  assertNotSecretPath(absolutePath);

  const stats = fs.statSync(absolutePath);
  if (stats.isDirectory()) {
    return summarizeDirectory(absolutePath, workspaceRoot);
  }

  if (!stats.isFile()) {
    throw new Error(`Context mount must be a file or folder: ${input}`);
  }

  return summarizeFile(absolutePath, workspaceRoot);
}

function summarizeDirectory(absolutePath, workspaceRoot) {
  const files = listContextFiles(absolutePath);
  const summaries = files.map((filePath) => summarizeFile(filePath, workspaceRoot, absolutePath));
  const hash = crypto.createHash("sha256");
  for (const summary of summaries) {
    hash.update(summary.relative_path);
    hash.update(summary.sha256);
  }

  return {
    type: "folder",
    source_path: path.relative(workspaceRoot, absolutePath) || ".",
    absolute_path: absolutePath,
    readonly: true,
    file_count: summaries.length,
    total_bytes: summaries.reduce((sum, item) => sum + item.bytes, 0),
    sha256: hash.digest("hex"),
    files: summaries.slice(0, 50)
  };
}

function summarizeFile(absolutePath, workspaceRoot, folderRoot = null) {
  assertNotSecretPath(absolutePath);

  const buffer = fs.readFileSync(absolutePath);
  const sourcePath = path.relative(workspaceRoot, absolutePath) || path.basename(absolutePath);
  const relativePath = folderRoot ? path.relative(folderRoot, absolutePath) : sourcePath;

  return {
    type: "file",
    source_path: sourcePath,
    relative_path: relativePath,
    absolute_path: absolutePath,
    readonly: true,
    bytes: buffer.byteLength,
    sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
    preview: previewText(buffer)
  };
}

function listContextFiles(root) {
  const results = [];
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (IGNORED_DIRS.has(entry.name)) {
        continue;
      }

      const entryPath = path.join(current, entry.name);
      assertNotSecretPath(entryPath);

      if (entry.isDirectory()) {
        stack.push(entryPath);
      } else if (entry.isFile()) {
        results.push(entryPath);
      }
    }
  }

  return results.sort((left, right) => left.localeCompare(right));
}

function assertNotSecretPath(value) {
  const basename = path.basename(value);
  if (SECRET_FILE_PATTERNS.some((pattern) => pattern.test(basename))) {
    throw new Error(
      `Refusing to mount possible secret file "${basename}". Mount brand/context instructions, not credentials.`
    );
  }
}

function previewText(buffer) {
  if (buffer.includes(0)) {
    return "";
  }

  const text = buffer.toString("utf8");
  const cleaned = text
    .replace(/\r/g, "")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .slice(0, 8)
    .join("\n");

  return cleaned.slice(0, 700);
}
