import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
const plywoodRoot = __dirname;
const cliPath = path.join(plywoodRoot, "bin", "plywood.mjs");
const contextRoot = path.join(plywoodRoot, "context");
const contextSandboxRoot = "/plywood/context";
const guiInputRoot = path.join(plywoodRoot, ".plywood", "gui-inputs");
const port = Number(process.env.PORT || 3210);
const secretFilePatterns = [
  /^\.env($|\.)/i,
  /secret/i,
  /credential/i,
  /private[-_]?key/i,
  /\.pem$/i,
  /\.key$/i,
  /\.p12$/i,
  /\.pfx$/i
];

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

    if (url.pathname.startsWith("/api/")) {
      await handleApiRequest(request, response, url);
      return;
    }

    await handleStaticRequest(response, url.pathname);
  } catch (error) {
    sendJson(response, 500, {
      error: error.message || "Unexpected server error."
    });
  }
});

server.listen(port, () => {
  console.log(`Plywood GUI listening on http://localhost:${port}`);
});

async function handleApiRequest(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, {
      ok: true,
      plywood_root: plywoodRoot
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/context") {
    sendJson(response, 200, await runPlywoodJson(["context", "status", "--json"]));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/context/files") {
    sendJson(response, 200, await readContextDirectory());
    return;
  }

  if (request.method === "PUT" && url.pathname.startsWith("/api/context/files/")) {
    const relativePath = decodeURIComponent(url.pathname.replace("/api/context/files/", ""));
    const body = await readJsonBody(request);
    const contents = typeof body.contents === "string" ? body.contents : "";
    const file = await writeContextFile(relativePath, contents);
    sendJson(response, 200, {
      file,
      context: await runPlywoodJson(["context", "status", "--json"])
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/blueprints") {
    sendJson(response, 200, await runPlywoodJson(["blueprint", "list", "--json"]));
    return;
  }

  if (request.method === "GET" && url.pathname.startsWith("/api/blueprints/")) {
    const blueprintId = decodeURIComponent(url.pathname.replace("/api/blueprints/", ""));
    if (!blueprintId) {
      sendJson(response, 400, { error: "Blueprint id is required." });
      return;
    }
    sendJson(response, 200, await runPlywoodJson(["blueprint", "inspect", blueprintId, "--json"]));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/runs/latest") {
    const only = url.searchParams.get("only");
    const args = ["review", "latest", "--json"];
    if (only) {
      args.splice(2, 0, "--only", only);
    }

    try {
      sendJson(response, 200, await runPlywoodJson(args));
    } catch (error) {
      if (isMissingRunError(error)) {
        sendJson(response, 404, { error: error.message });
        return;
      }
      throw error;
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/runs") {
    const body = await readJsonBody(request);
    const blueprintId = sanitizeText(body.blueprintId);
    const target = sanitizeText(body.target, "demo");
    const safetyMode = sanitizeText(body.safetyMode, "draft-only");
    const extraInstructions = typeof body.extraInstructions === "string" ? body.extraInstructions.trim() : "";
    const contextPaths = Array.isArray(body.contextPaths)
      ? body.contextPaths.map((value) => sanitizeText(value)).filter(Boolean)
      : [];
    const resolvedContextPaths = [...contextPaths];

    if (extraInstructions) {
      resolvedContextPaths.push(await writeRunInstructions(extraInstructions));
    }

    const args = ["exec"];
    if (blueprintId) {
      args.push(blueprintId);
    }
    args.push("--target", target, "--safety-mode", safetyMode);
    for (const contextPath of resolvedContextPaths) {
      args.push("--context", contextPath);
    }
    args.push("--json");

    const manifest = await runPlywoodJson(args);
    sendJson(response, 200, { manifest });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/approve") {
    const body = await readJsonBody(request);
    const reference = sanitizeText(body.reference, "latest");
    const actor = sanitizeText(body.actor, "gui-operator");
    const note = sanitizeText(body.note, "");
    const allNeedsApproval = body.allNeedsApproval === true;
    const actionIds = Array.isArray(body.actionIds)
      ? body.actionIds.map((value) => sanitizeText(value)).filter(Boolean)
      : [];

    const args = ["approve", reference];
    if (allNeedsApproval) {
      args.push("--all-needs-approval");
    } else {
      for (const actionId of actionIds) {
        args.push("--action", actionId);
      }
    }
    args.push("--actor", actor);
    if (note) {
      args.push("--note", note);
    }
    args.push("--json");

    const approval = await runPlywoodJson(args);
    const manifest = await runPlywoodJson(["review", reference, "--json"]);
    sendJson(response, 200, { approval, manifest });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/execute") {
    const body = await readJsonBody(request);
    const reference = sanitizeText(body.reference, "latest");
    const actor = sanitizeText(body.actor, "gui-operator");
    const execution = await runPlywoodJson(["execute", reference, "--actor", actor, "--json"]);
    const manifest = await runPlywoodJson(["review", reference, "--json"]);
    sendJson(response, 200, { execution, manifest });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/export-audit") {
    const body = await readJsonBody(request);
    const reference = sanitizeText(body.reference, "latest");
    const outDir = sanitizeText(body.outDir, "");
    const args = ["export-audit", reference, "--json"];
    if (outDir) {
      args.splice(2, 0, "--out", outDir);
    }
    sendJson(response, 200, await runPlywoodJson(args));
    return;
  }

  sendJson(response, 404, { error: "Route not found." });
}

async function handleStaticRequest(response, pathname) {
  const resolvedPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(publicDir, resolvedPath));
  if (!filePath.startsWith(publicDir)) {
    sendText(response, 403, "Forbidden");
    return;
  }

  try {
    const contents = await fs.readFile(filePath);
    response.writeHead(200, {
      "Content-Type": contentType(filePath),
      "Cache-Control": "no-store"
    });
    response.end(contents);
  } catch (error) {
    if (error.code === "ENOENT") {
      sendText(response, 404, "Not found");
      return;
    }
    throw error;
  }
}

function runPlywoodJson(args) {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [cliPath, ...args], { cwd: plywoodRoot, encoding: "utf8" }, (error, stdout, stderr) => {
      if (error) {
        const message = extractCliError(stderr, stdout, error.message);
        reject(new Error(message));
        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch (parseError) {
        reject(new Error(`Failed to parse CLI JSON output: ${parseError.message}`));
      }
    });
  });
}

function extractCliError(stderr, stdout, fallback) {
  const message = [stderr, stdout, fallback]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .find(Boolean);
  return message || "Plywood command failed.";
}

function isMissingRunError(error) {
  return error.message.includes("No latest run found") || error.message.includes("Run manifest not found");
}

function sanitizeText(value, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }
  return value.trim();
}

async function readContextDirectory() {
  await fs.mkdir(contextRoot, { recursive: true });
  const files = await listContextFiles(contextRoot);
  return {
    source_path: "context",
    absolute_path: contextRoot,
    sandbox_root: contextSandboxRoot,
    files
  };
}

async function writeRunInstructions(contents) {
  await fs.mkdir(guiInputRoot, { recursive: true });
  const relativePath = ".plywood/gui-inputs/review-instructions.md";
  const absolutePath = path.join(plywoodRoot, relativePath);
  const normalized = contents.endsWith("\n") ? contents : `${contents}\n`;
  const withHeading = normalized.startsWith("#")
    ? normalized
    : `# Notes For This Review\n\n${normalized}`;
  await fs.writeFile(absolutePath, withHeading, "utf8");
  return relativePath;
}

async function listContextFiles(rootDir) {
  const stack = [rootDir];
  const files = [];

  while (stack.length > 0) {
    const currentDir = stack.pop();
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      if (entry.name === ".git" || entry.name === ".plywood" || entry.name === "node_modules") {
        continue;
      }

      const absolutePath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolutePath);
        continue;
      }

      if (entry.isFile()) {
        files.push(await readContextFile(absolutePath));
      }
    }
  }

  return files.sort((left, right) => left.path.localeCompare(right.path));
}

async function readContextFile(absolutePath) {
  const relativePath = path.relative(contextRoot, absolutePath).split(path.sep).join("/");
  const stats = await fs.stat(absolutePath);
  const contents = await fs.readFile(absolutePath, "utf8");

  return {
    path: relativePath,
    absolute_path: absolutePath,
    sandbox_path: path.posix.join(contextSandboxRoot, relativePath),
    bytes: stats.size,
    updated_at: stats.mtime.toISOString(),
    contents
  };
}

async function writeContextFile(inputPath, contents) {
  const { relativePath, absolutePath } = resolveContextFilePath(inputPath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, contents, "utf8");
  return readContextFile(absolutePath);
}

function resolveContextFilePath(inputPath) {
  const relativePath = String(inputPath || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");

  if (!relativePath) {
    throw new Error("Context file path is required.");
  }

  if (relativePath.includes("..")) {
    throw new Error("Context file path must stay inside context/.");
  }

  const basename = path.posix.basename(relativePath);
  if (secretFilePatterns.some((pattern) => pattern.test(basename))) {
    throw new Error(`Refusing to write possible secret file "${basename}".`);
  }

  const absolutePath = path.resolve(contextRoot, relativePath);
  if (!absolutePath.startsWith(`${contextRoot}${path.sep}`) && absolutePath !== contextRoot) {
    throw new Error("Context file path resolved outside context/.");
  }

  return { relativePath, absolutePath };
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk.toString("utf8");
      if (raw.length > 1024 * 1024) {
        reject(new Error("Request body too large."));
        request.destroy();
      }
    });
    request.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error("Invalid JSON request body."));
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response, statusCode, value) {
  const payload = `${JSON.stringify(value, null, 2)}\n`;
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(payload);
}

function sendText(response, statusCode, value) {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(value);
}

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}
