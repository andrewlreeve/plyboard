const SAFETY_MODE_ALIASES = new Map([
  ["read-only", "read-only"],
  ["readonly", "read-only"],
  ["read_only", "read-only"],
  ["draft-only", "draft-only"],
  ["draft_only", "draft-only"],
  ["draft", "draft-only"],
  ["staging-write", "staging-write"],
  ["staging_write", "staging-write"],
  ["staging write", "staging-write"],
  ["production-requires-approval", "production-requires-approval"],
  ["production_requires_approval", "production-requires-approval"],
  ["production requires approval", "production-requires-approval"],
  ["prod-approval", "production-requires-approval"]
]);

const STORE_TARGETS = new Set(["demo", "dev", "staging", "production"]);

export function parseArgs(argv) {
  const positionals = [];
  const flags = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--") {
      positionals.push(...argv.slice(index + 1));
      break;
    }

    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    const raw = token.slice(2);
    const equalsIndex = raw.indexOf("=");
    let name = raw;
    let value = true;

    if (equalsIndex !== -1) {
      name = raw.slice(0, equalsIndex);
      value = raw.slice(equalsIndex + 1);
    } else if (argv[index + 1] && !argv[index + 1].startsWith("--")) {
      value = argv[index + 1];
      index += 1;
    }

    if (flags[name] === undefined) {
      flags[name] = value;
    } else if (Array.isArray(flags[name])) {
      flags[name].push(value);
    } else {
      flags[name] = [flags[name], value];
    }
  }

  return { positionals, flags };
}

export function getRepeatedFlag(flags, name) {
  const value = flags[name];
  if (value === undefined || value === false) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

export function normalizeSafetyMode(value = "draft-only") {
  const normalized = SAFETY_MODE_ALIASES.get(String(value).trim().toLowerCase());
  if (!normalized) {
    throw new Error(
      `Unknown safety mode "${value}". Use read-only, draft-only, staging-write, or production-requires-approval.`
    );
  }
  return normalized;
}

export function normalizeTarget(value = "demo") {
  const normalized = String(value).trim().toLowerCase();
  if (!STORE_TARGETS.has(normalized)) {
    throw new Error(`Unknown store target "${value}". Use demo, dev, staging, or production.`);
  }
  return normalized;
}

export function isJsonFlag(flags) {
  return flags.json === true || flags.json === "true";
}

export function isHelp(argv) {
  return argv.length === 0 || argv.includes("--help") || argv.includes("-h");
}
