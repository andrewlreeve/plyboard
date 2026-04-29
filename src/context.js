import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const DEFAULT_CONTEXT_DIR = "context";
export const DEFAULT_CONTEXT_SANDBOX_PATH = "/plywood/context";
const EXTRA_CONTEXT_SANDBOX_ROOT = "/plywood/context/extra";

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

const IGNORED_DIRS = new Set([".git", "node_modules", "runs", ".plywood", "exports"]);

export function resolveContextMounts(inputs, workspaceRoot, { includeDefault = false } = {}) {
  const mounts = [];
  const seen = new Set();

  if (includeDefault && defaultContextExists(workspaceRoot)) {
    const mount = resolveContextMount(DEFAULT_CONTEXT_DIR, workspaceRoot, {
      mountRole: "default",
      sandboxPath: DEFAULT_CONTEXT_SANDBOX_PATH
    });
    mounts.push(mount);
    seen.add(mount.absolute_path);
  }

  inputs.forEach((input, index) => {
    const mount = resolveContextMount(input, workspaceRoot, {
      mountRole: "extra",
      sandboxPath: buildExtraSandboxPath(input, workspaceRoot, index)
    });
    if (!seen.has(mount.absolute_path)) {
      mounts.push(mount);
      seen.add(mount.absolute_path);
    }
  });

  return mounts;
}

export function defaultContextExists(workspaceRoot) {
  return fs.existsSync(path.join(workspaceRoot, DEFAULT_CONTEXT_DIR));
}

export function getContextStatus(workspaceRoot) {
  if (!defaultContextExists(workspaceRoot)) {
    return {
      exists: false,
      source_path: DEFAULT_CONTEXT_DIR,
      sandbox_path: DEFAULT_CONTEXT_SANDBOX_PATH,
      readonly: true,
      auto_mount: false
    };
  }

  const mount = resolveContextMount(DEFAULT_CONTEXT_DIR, workspaceRoot, {
    mountRole: "default",
    sandboxPath: DEFAULT_CONTEXT_SANDBOX_PATH
  });

  return {
    exists: true,
    auto_mount: true,
    ...mount
  };
}

export function initDefaultContext(workspaceRoot, { force = false } = {}) {
  const contextDir = path.join(workspaceRoot, DEFAULT_CONTEXT_DIR);
  const files = {
    "AGENTS.md": starterAgentsMarkdown(),
    "seo-guidelines.md": starterSeoMarkdown(),
    "safety-policy.md": starterSafetyMarkdown()
  };

  fs.mkdirSync(contextDir, { recursive: true });

  const existingFiles = Object.keys(files).filter((file) => fs.existsSync(path.join(contextDir, file)));
  if (existingFiles.length > 0 && !force) {
    return {
      created: false,
      source_path: DEFAULT_CONTEXT_DIR,
      sandbox_path: DEFAULT_CONTEXT_SANDBOX_PATH,
      message: `Context folder already exists at ${DEFAULT_CONTEXT_DIR}. Use --force to rewrite starter files.`
    };
  }

  for (const [file, contents] of Object.entries(files)) {
    const filePath = path.join(contextDir, file);
    if (force || !fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, contents);
    }
  }

  return {
    created: true,
    source_path: DEFAULT_CONTEXT_DIR,
    sandbox_path: DEFAULT_CONTEXT_SANDBOX_PATH,
    files: Object.keys(files),
    message: `Context folder ready at ${DEFAULT_CONTEXT_DIR}. It auto-mounts read-only at ${DEFAULT_CONTEXT_SANDBOX_PATH}.`
  };
}

function resolveContextMount(input, workspaceRoot, { mountRole, sandboxPath }) {
  const absolutePath = path.resolve(workspaceRoot, String(input));
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Context mount does not exist: ${input}`);
  }

  assertNotSecretPath(absolutePath);

  const stats = fs.statSync(absolutePath);
  if (stats.isDirectory()) {
    return summarizeDirectory(absolutePath, workspaceRoot, { mountRole, sandboxPath });
  }

  if (!stats.isFile()) {
    throw new Error(`Context mount must be a file or folder: ${input}`);
  }

  return summarizeFile(absolutePath, workspaceRoot, { mountRole, sandboxPath });
}

function summarizeDirectory(absolutePath, workspaceRoot, { mountRole, sandboxPath }) {
  const files = listContextFiles(absolutePath);
  const summaries = files.map((filePath) => {
    const relativePath = path.relative(absolutePath, filePath);
    return summarizeFile(filePath, workspaceRoot, {
      folderRoot: absolutePath,
      mountRole,
      sandboxPath: path.posix.join(sandboxPath, relativePath.split(path.sep).join(path.posix.sep))
    });
  });
  const hash = crypto.createHash("sha256");
  for (const summary of summaries) {
    hash.update(summary.relative_path);
    hash.update(summary.sha256);
  }

  return {
    type: "folder",
    source_path: path.relative(workspaceRoot, absolutePath) || ".",
    absolute_path: absolutePath,
    sandbox_path: sandboxPath,
    mount_role: mountRole,
    readonly: true,
    file_count: summaries.length,
    total_bytes: summaries.reduce((sum, item) => sum + item.bytes, 0),
    sha256: hash.digest("hex"),
    files: summaries.slice(0, 50)
  };
}

function summarizeFile(absolutePath, workspaceRoot, { folderRoot = null, mountRole, sandboxPath }) {
  assertNotSecretPath(absolutePath);

  const buffer = fs.readFileSync(absolutePath);
  const sourcePath = path.relative(workspaceRoot, absolutePath) || path.basename(absolutePath);
  const relativePath = folderRoot ? path.relative(folderRoot, absolutePath) : sourcePath;

  return {
    type: "file",
    source_path: sourcePath,
    relative_path: relativePath,
    absolute_path: absolutePath,
    sandbox_path: sandboxPath,
    mount_role: mountRole,
    readonly: true,
    bytes: buffer.byteLength,
    sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
    preview: previewText(buffer)
  };
}

function buildExtraSandboxPath(input, workspaceRoot, index) {
  const absolutePath = path.resolve(workspaceRoot, String(input));
  const basename = path.basename(absolutePath).replace(/[^a-zA-Z0-9._-]/g, "-") || `mount-${index + 1}`;
  return path.posix.join(EXTRA_CONTEXT_SANDBOX_ROOT, basename);
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

function starterAgentsMarkdown() {
  return `# Brand Context

These files are mounted read-only into every Plywood sandbox at ${DEFAULT_CONTEXT_SANDBOX_PATH}.

## How Agents Should Act

- Act like a careful ecommerce operator.
- Prefer draft-safe edits and audit recommendations.
- Make proposed production changes reviewable before execution.
- Explain why each action is safe, needs approval, or blocked.
- Never request raw API secrets inside the sandbox.

## Brand Voice

- Clear, practical, and specific.
- Avoid unsupported performance claims.
- Prefer concrete product details: material, fit, care, use case, and collection role.
`;
}

function starterSeoMarkdown() {
  return `# SEO Guidelines

- SEO titles should include the product type and strongest search modifier.
- Meta descriptions should be plain-language summaries, not keyword stuffing.
- Do not use launch language for products that are still marked as draft.
`;
}

function starterSafetyMarkdown() {
  return `# Safety Policy

- Safe: draft enrichment, SEO drafts, image alt text drafts, media issue flags, and audit recommendations.
- Needs approval: publishing, live merchandising changes, pricing, inventory, and collection publication.
- Blocked: media deletion, theme publishing, customer messaging, payment/refund actions, admin user changes, and webhook creation.
`;
}
