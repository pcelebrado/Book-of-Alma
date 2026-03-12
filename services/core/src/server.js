import childProcess from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import express from "express";
import httpProxy from "http-proxy";
import * as tar from "tar";

// Migrate deprecated CLAWDBOT_* env vars → OPENCLAW_* so existing Railway deployments
// keep working. Users should update their Railway Variables to use the new names.
for (const suffix of ["PUBLIC_PORT", "STATE_DIR", "WORKSPACE_DIR", "GATEWAY_TOKEN", "CONFIG_PATH"]) {
  const oldKey = `CLAWDBOT_${suffix}`;
  const newKey = `OPENCLAW_${suffix}`;
  if (process.env[oldKey] && !process.env[newKey]) {
    process.env[newKey] = process.env[oldKey];
    // Best-effort compatibility shim for old Railway templates.
    // Intentionally no warning: Railway templates can still set legacy keys and warnings are noisy.
  }
  // Avoid forwarding legacy variables into OpenClaw subprocesses.
  // OpenClaw logs a warning when deprecated CLAWDBOT_* variables are present.
  delete process.env[oldKey];
}

// Railway images can export BUN_INSTALL, which makes the packaged qmd launcher
// prefer `bun` over `node`. In this container the bun-side qmd path is broken,
// so force node-backed qmd/OpenClaw subprocesses by clearing the hint.
delete process.env.BUN_INSTALL;

// Railway injects PORT at runtime and routes traffic to that port.
// Do not force a different public port in the container image, or the service may
// boot but the Railway domain will be routed to a different port.
//
// OPENCLAW_PUBLIC_PORT is kept as an escape hatch for non-Railway deployments.
const PORT = Number.parseInt(process.env.PORT ?? process.env.OPENCLAW_PUBLIC_PORT ?? "3000", 10);

// State/workspace
// OpenClaw defaults to ~/.openclaw.
const IS_RAILWAY = Boolean(process.env.RAILWAY_ENVIRONMENT);
const DATA_ROOT = process.env.OPENCLAW_DATA_ROOT?.trim() || "/data";
const STATE_DIR =
  process.env.OPENCLAW_STATE_DIR?.trim() ||
  (IS_RAILWAY ? path.join(DATA_ROOT, ".openclaw") : path.join(os.homedir(), ".openclaw"));

const WORKSPACE_VOLUME_DIR =
  process.env.OPENCLAW_WORKSPACE_VOLUME_DIR?.trim() ||
  (IS_RAILWAY ? path.join(DATA_ROOT, "workspace") : path.join(STATE_DIR, "workspace"));

const WORKSPACE_DIR =
  process.env.OPENCLAW_WORKSPACE_DIR?.trim() ||
  (IS_RAILWAY ? WORKSPACE_VOLUME_DIR : path.join(os.homedir(), ".openclaw", "workspace"));
const CREDENTIALS_DIR = path.join(STATE_DIR, "credentials");

// Protect /setup with a user-provided password.
const SETUP_PASSWORD = process.env.SETUP_PASSWORD?.trim();
const INTERNAL_SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN?.trim() || "";

// Gateway admin token (protects OpenClaw gateway + Control UI).
// Must be stable across restarts. If not provided via env, persist it in the state dir.
function resolveGatewayToken() {
  const envTok = process.env.OPENCLAW_GATEWAY_TOKEN?.trim();
  if (envTok) return envTok;

  const tokenPath = path.join(STATE_DIR, "gateway.token");
  try {
    const existing = fs.readFileSync(tokenPath, "utf8").trim();
    if (existing) return existing;
  } catch {
    // ignore
  }

  const generated = crypto.randomBytes(32).toString("hex");
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(tokenPath, generated, { encoding: "utf8", mode: 0o600 });
  } catch {
    // best-effort
  }
  return generated;
}

const OPENCLAW_GATEWAY_TOKEN = resolveGatewayToken();
process.env.OPENCLAW_GATEWAY_TOKEN = OPENCLAW_GATEWAY_TOKEN;

// Where the gateway will listen internally (we proxy to it).
const INTERNAL_GATEWAY_PORT = Number.parseInt(process.env.INTERNAL_GATEWAY_PORT ?? "18789", 10);
const INTERNAL_GATEWAY_HOST = process.env.INTERNAL_GATEWAY_HOST ?? "127.0.0.1";
const GATEWAY_TARGET = `http://${INTERNAL_GATEWAY_HOST}:${INTERNAL_GATEWAY_PORT}`;

// Always run the built-from-source CLI entry directly to avoid PATH/global-install mismatches.
const OPENCLAW_ENTRY = process.env.OPENCLAW_ENTRY?.trim() || "/openclaw/dist/entry.js";
const OPENCLAW_NODE = process.env.OPENCLAW_NODE?.trim() || "node";
const OPENCLAW_MEMORY_BACKEND = process.env.OPENCLAW_MEMORY_BACKEND?.trim() || "qmd";
const OPENCLAW_MEMORY_QMD_COMMAND =
  process.env.OPENCLAW_MEMORY_QMD_COMMAND?.trim() ||
  "/root/.bun/install/global/node_modules/@tobilu/qmd/bin/qmd";
const OPENCLAW_MEMORY_QMD_UPDATE_INTERVAL =
  process.env.OPENCLAW_MEMORY_QMD_UPDATE_INTERVAL?.trim() || "5m";
const OPENCLAW_MEMORY_QMD_WORKSPACE_PATTERN =
  process.env.OPENCLAW_MEMORY_QMD_WORKSPACE_PATTERN?.trim() || "**/*.md";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY?.trim() || "";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY?.trim() || "";
const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY?.trim() || "";
const OPENCLAW_MEMORY_SEARCH_PROVIDER =
  process.env.OPENCLAW_MEMORY_SEARCH_PROVIDER?.trim().toLowerCase() || "local";
const OPENCLAW_MEMORY_SEARCH_FALLBACK =
  process.env.OPENCLAW_MEMORY_SEARCH_FALLBACK?.trim() || "none";
const OPENCLAW_MEMORY_SEARCH_OPENAI_MODEL =
  process.env.OPENCLAW_MEMORY_SEARCH_OPENAI_MODEL?.trim() || "text-embedding-3-small";
const OPENCLAW_MEMORY_SEARCH_GEMINI_MODEL =
  process.env.OPENCLAW_MEMORY_SEARCH_GEMINI_MODEL?.trim() || "gemini-embedding-001";
const OPENCLAW_MEMORY_SEARCH_VOYAGE_MODEL =
  process.env.OPENCLAW_MEMORY_SEARCH_VOYAGE_MODEL?.trim() || "voyage-3-lite";
const OPENCLAW_MEMORY_SEARCH_LOCAL_MODEL_PATH =
  process.env.OPENCLAW_MEMORY_SEARCH_LOCAL_MODEL_PATH?.trim() ||
  "hf:ggml-org/embeddinggemma-300m-qat-q8_0-GGUF/embeddinggemma-300m-qat-Q8_0.gguf";
const OPENCLAW_MEMORY_SEARCH_LOCAL_MODEL_CACHE_DIR =
  process.env.OPENCLAW_MEMORY_SEARCH_LOCAL_MODEL_CACHE_DIR?.trim() ||
  path.join(STATE_DIR, "models", "node-llama-cpp");
const OPENCLAW_MEMORY_SEARCH_STORE_PATH =
  process.env.OPENCLAW_MEMORY_SEARCH_STORE_PATH?.trim() ||
  path.join(STATE_DIR, "memory", "{agentId}.sqlite");

function parseBoolEnv(value, fallback) {
  if (value == null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parsePositiveIntEnv(value, fallback) {
  if (value == null) return fallback;
  const parsed = Number.parseInt(String(value).trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const OPENCLAW_MEMORY_QMD_WAIT_FOR_BOOT_SYNC = parseBoolEnv(
  process.env.OPENCLAW_MEMORY_QMD_WAIT_FOR_BOOT_SYNC,
  false,
);
const OPENCLAW_MEMORY_QMD_INCLUDE_DEFAULT_MEMORY = parseBoolEnv(
  process.env.OPENCLAW_MEMORY_QMD_INCLUDE_DEFAULT_MEMORY,
  false,
);
const OPENCLAW_MEMORY_QMD_INDEX_WORKSPACE = parseBoolEnv(
  process.env.OPENCLAW_MEMORY_QMD_INDEX_WORKSPACE,
  true,
);
const OPENCLAW_CONTROL_UI_ALLOW_INSECURE_AUTH = parseBoolEnv(
  process.env.OPENCLAW_CONTROL_UI_ALLOW_INSECURE_AUTH,
  IS_RAILWAY,
);
const OPENCLAW_MEMORY_QMD_QUERY_TIMEOUT_MS = parsePositiveIntEnv(
  process.env.OPENCLAW_MEMORY_QMD_QUERY_TIMEOUT_MS,
  120_000,
);
const OPENCLAW_MEMORY_QMD_COMMAND_TIMEOUT_MS = parsePositiveIntEnv(
  process.env.OPENCLAW_MEMORY_QMD_COMMAND_TIMEOUT_MS,
  120_000,
);
const OPENCLAW_MEMORY_QMD_UPDATE_TIMEOUT_MS = parsePositiveIntEnv(
  process.env.OPENCLAW_MEMORY_QMD_UPDATE_TIMEOUT_MS,
  60_000,
);
const OPENCLAW_MEMORY_QMD_EMBED_TIMEOUT_MS = parsePositiveIntEnv(
  process.env.OPENCLAW_MEMORY_QMD_EMBED_TIMEOUT_MS,
  300_000,
);
const OPENCLAW_MEMORY_WARMUP_ENABLED = parseBoolEnv(
  process.env.OPENCLAW_MEMORY_WARMUP_ENABLED,
  false,
);
const OPENCLAW_MEMORY_QMD_WARMUP_QUERY =
  process.env.OPENCLAW_MEMORY_QMD_WARMUP_QUERY?.trim() || "test";
const OPENCLAW_MEMORY_WARMUP_RETRIES = parsePositiveIntEnv(
  process.env.OPENCLAW_MEMORY_WARMUP_RETRIES,
  3,
);
const OPENCLAW_MEMORY_WARMUP_BACKOFF_MS = parsePositiveIntEnv(
  process.env.OPENCLAW_MEMORY_WARMUP_BACKOFF_MS,
  10_000,
);
const OPENCLAW_MEMORY_WARMUP_TIMEOUT_MS = parsePositiveIntEnv(
  process.env.OPENCLAW_MEMORY_WARMUP_TIMEOUT_MS,
  300_000,
);
const OPENCLAW_GATEWAY_READY_TIMEOUT_MS = parsePositiveIntEnv(
  process.env.OPENCLAW_GATEWAY_READY_TIMEOUT_MS,
  45_000,
);
const CLAUDE_CLI_COMMAND = process.env.OPENCLAW_CLAUDE_CLI_COMMAND?.trim() || "claude";
const CLAUDE_MAX_PROXY_COMMAND =
  process.env.OPENCLAW_CLAUDE_MAX_PROXY_COMMAND?.trim() || "claude-max-api";
const CLAUDE_MAX_PROXY_HOST = process.env.OPENCLAW_CLAUDE_MAX_PROXY_HOST?.trim() || "127.0.0.1";
const CLAUDE_MAX_PROXY_PORT = parsePositiveIntEnv(
  process.env.OPENCLAW_CLAUDE_MAX_PROXY_PORT,
  3456,
);
const CLAUDE_MAX_PROXY_BASE_URL =
  process.env.OPENCLAW_CLAUDE_MAX_PROXY_BASE_URL?.trim() ||
  `http://${CLAUDE_MAX_PROXY_HOST}:${CLAUDE_MAX_PROXY_PORT}/v1`;
const CLAUDE_MAX_PROXY_HEALTH_URL = `${CLAUDE_MAX_PROXY_BASE_URL.replace(/\/v1\/?$/, "")}/health`;
const CLAUDE_MAX_PROXY_PROVIDER_ID =
  process.env.OPENCLAW_CLAUDE_MAX_PROXY_PROVIDER_ID?.trim() || "claude-max";
const CLAUDE_MAX_PROXY_DEFAULT_MODEL =
  process.env.OPENCLAW_CLAUDE_MAX_PROXY_DEFAULT_MODEL?.trim() || "claude-opus-4";
const CLAUDE_MAX_PROXY_CLI_STATE_DIR =
  process.env.OPENCLAW_CLAUDE_STATE_DIR?.trim() || path.join(DATA_ROOT, ".claude");

const CLAUDE_MAX_PROXY_MODELS = [
  { id: "claude-opus-4", name: "Claude Opus 4" },
  { id: "claude-sonnet-4", name: "Claude Sonnet 4" },
  { id: "claude-haiku-4", name: "Claude Haiku 4" },
];

function isClaudeMaxProxyAuthChoice(value) {
  return String(value || "").trim() === "claude-max-proxy";
}

function buildClaudeMaxProxyProviderConfig() {
  return {
    baseUrl: CLAUDE_MAX_PROXY_BASE_URL,
    api: "openai-completions",
    models: CLAUDE_MAX_PROXY_MODELS.map((entry) => ({ ...entry })),
  };
}

function buildClaudeMaxProxyModelRef(modelId = CLAUDE_MAX_PROXY_DEFAULT_MODEL) {
  return `${CLAUDE_MAX_PROXY_PROVIDER_ID}/${modelId}`;
}

function normalizeSetupPayload(payload = {}) {
  if (!isClaudeMaxProxyAuthChoice(payload.authChoice)) {
    return payload;
  }

  return {
    ...payload,
    authChoice: "skip",
    authSecret: "",
    customProviderId: CLAUDE_MAX_PROXY_PROVIDER_ID,
    customProviderBaseUrl: CLAUDE_MAX_PROXY_BASE_URL,
    customProviderApi: "openai-completions",
    customProviderApiKeyEnv: "",
    customProviderModelId: payload.customProviderModelId?.trim() || CLAUDE_MAX_PROXY_DEFAULT_MODEL,
  };
}

function runSyncCommand(command, args = []) {
  try {
    const result = childProcess.spawnSync(command, args, {
      encoding: "utf8",
      timeout: 10_000,
      env: {
        ...process.env,
        HOME: os.homedir(),
        CLAUDE_CONFIG_DIR: CLAUDE_MAX_PROXY_CLI_STATE_DIR,
        DISABLE_AUTOUPDATER: "1",
      },
    });
    const stdout = String(result.stdout || "");
    const stderr = String(result.stderr || "");
    return {
      ok: result.status === 0,
      code: result.status ?? 127,
      output: `${stdout}${stderr}`.trim(),
    };
  } catch (err) {
    return {
      ok: false,
      code: 127,
      output: String(err),
    };
  }
}
function resolveWorkspaceQmdPaths() {
  if (!OPENCLAW_MEMORY_QMD_INDEX_WORKSPACE) {
    return [];
  }

  fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
  return [
    {
      name: "workspace",
      path: WORKSPACE_DIR,
      pattern: OPENCLAW_MEMORY_QMD_WORKSPACE_PATTERN,
    },
  ];
}

function resolveMemorySearchStrategy() {
  const explicit = OPENCLAW_MEMORY_SEARCH_PROVIDER;
  const normalizedExplicit =
    explicit && ["openai", "gemini", "voyage", "local"].includes(explicit) ? explicit : "";
  const provider = normalizedExplicit || "local";

  if (provider === "openai") {
    return {
      provider,
      source: normalizedExplicit ? "env:OPENCLAW_MEMORY_SEARCH_PROVIDER" : "env:OPENAI_API_KEY",
      fallback: OPENCLAW_MEMORY_SEARCH_FALLBACK,
      model: OPENCLAW_MEMORY_SEARCH_OPENAI_MODEL,
    };
  }

  if (provider === "gemini") {
    return {
      provider,
      source: normalizedExplicit ? "env:OPENCLAW_MEMORY_SEARCH_PROVIDER" : "env:GEMINI_API_KEY",
      fallback: OPENCLAW_MEMORY_SEARCH_FALLBACK,
      model: OPENCLAW_MEMORY_SEARCH_GEMINI_MODEL,
    };
  }

  if (provider === "voyage") {
    return {
      provider,
      source: normalizedExplicit ? "env:OPENCLAW_MEMORY_SEARCH_PROVIDER" : "env:VOYAGE_API_KEY",
      fallback: OPENCLAW_MEMORY_SEARCH_FALLBACK,
      model: OPENCLAW_MEMORY_SEARCH_VOYAGE_MODEL,
    };
  }

  return {
    provider: "local",
    source: normalizedExplicit ? "env:OPENCLAW_MEMORY_SEARCH_PROVIDER" : "default:local",
    fallback: "none",
    local: {
      modelPath: OPENCLAW_MEMORY_SEARCH_LOCAL_MODEL_PATH,
      modelCacheDir: OPENCLAW_MEMORY_SEARCH_LOCAL_MODEL_CACHE_DIR,
    },
  };
}

function getJsonValue(target, dottedPath) {
  return String(dottedPath || "")
    .split(".")
    .filter(Boolean)
    .reduce((cursor, key) => (cursor && typeof cursor === "object" ? cursor[key] : undefined), target);
}

function remoteMemorySearchEnvVar(provider) {
  switch (provider) {
    case "openai":
      return "OPENAI_API_KEY";
    case "gemini":
      return "GEMINI_API_KEY";
    case "voyage":
      return "VOYAGE_API_KEY";
    default:
      return "";
  }
}

function materializeAgentToken(templatePath, agentId = "main") {
  return String(templatePath || "").replaceAll("{agentId}", agentId);
}

function readConfiguredProviderApiKey(provider) {
  if (!provider || !isConfigured()) return "";
  try {
    const snapshot = readConfigJsonFromDisk();
    const configuredApiKey = getJsonValue(snapshot.config, `models.providers.${provider}.apiKey`);
    return typeof configuredApiKey === "string" ? configuredApiKey.trim() : "";
  } catch {
    return "";
  }
}

function resolveMemorySearchRuntime() {
  const strategy = resolveMemorySearchStrategy();
  const runtime = {
    ...strategy,
    storePath: OPENCLAW_MEMORY_SEARCH_STORE_PATH,
    warnings: [],
    hints: [],
  };

  if (strategy.provider === "local") {
    const modelPath = strategy.local?.modelPath?.trim() || "";
    const modelCacheDir = strategy.local?.modelCacheDir?.trim() || "";

    if (!modelPath) {
      runtime.warnings.push("Local memory search is configured but OPENCLAW_MEMORY_SEARCH_LOCAL_MODEL_PATH is blank.");
      runtime.hints.push(
        "Set OPENCLAW_MEMORY_SEARCH_LOCAL_MODEL_PATH to a GGUF file path or hf: URI before running openclaw memory search.",
      );
    } else if (!modelPath.startsWith("hf:") && !fs.existsSync(modelPath)) {
      runtime.warnings.push(`Local memory search model path does not exist: ${modelPath}`);
      runtime.hints.push(
        "Mount the GGUF file into the image or switch OPENCLAW_MEMORY_SEARCH_LOCAL_MODEL_PATH to the default hf: embeddinggemma URI.",
      );
    }

    if (!modelCacheDir) {
      runtime.warnings.push("Local memory search cache directory is blank.");
      runtime.hints.push("Set OPENCLAW_MEMORY_SEARCH_LOCAL_MODEL_CACHE_DIR to a persistent directory under /data.");
    }
    return runtime;
  }

  const envVar = remoteMemorySearchEnvVar(strategy.provider);
  const envApiKey = envVar ? process.env[envVar]?.trim() || "" : "";
  const configuredApiKey = readConfiguredProviderApiKey(strategy.provider);
  if (!envApiKey && !configuredApiKey) {
    runtime.warnings.push(
      `${strategy.provider} memory search is selected but neither ${envVar} nor models.providers.${strategy.provider}.apiKey is configured.`,
    );
    runtime.hints.push(
      `Set ${envVar} in Railway Variables, or define models.providers.${strategy.provider}.apiKey before running openclaw memory search.`,
    );
  }

  return runtime;
}

function ensureWritableDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  try {
    fs.chmodSync(dirPath, 0o700);
  } catch {}
  const probePath = path.join(dirPath, ".write-test");
  fs.writeFileSync(probePath, "ok", { encoding: "utf8", mode: 0o600 });
  fs.rmSync(probePath, { force: true });
}

function ensureMemorySearchRuntimeLayout(runtime = resolveMemorySearchRuntime()) {
  const dirs = [path.dirname(materializeAgentToken(runtime.storePath, "main"))];

  if (runtime.provider === "local" && runtime.local?.modelCacheDir) {
    dirs.push(runtime.local.modelCacheDir);
  }

  for (const dir of dirs.filter(Boolean)) {
    try {
      ensureWritableDir(dir);
    } catch (err) {
      console.warn(`[memory-search] warning: failed to prepare writable dir ${dir}: ${String(err)}`);
    }
  }

  return runtime;
}

function describeMemorySearchRuntime(runtime = resolveMemorySearchRuntime()) {
  const modelSummary =
    runtime.provider === "local"
      ? `modelPath=${runtime.local?.modelPath || "(unset)"} cacheDir=${runtime.local?.modelCacheDir || "(unset)"}`
      : `model=${runtime.model || "(unset)"}`;
  return `provider=${runtime.provider} source=${runtime.source} fallback=${runtime.fallback} ${modelSummary} store=${runtime.storePath}`;
}

function logMemorySearchRuntime(runtime = resolveMemorySearchRuntime(), context = "boot") {
  console.log(`[memory-search] ${context} resolved ${describeMemorySearchRuntime(runtime)}`);
  for (const warning of runtime.warnings) {
    console.warn(`[memory-search] warning: ${warning}`);
  }
  for (const hint of runtime.hints) {
    console.warn(`[memory-search] remediation: ${hint}`);
  }
}

function resolveRealPathOrSelf(targetPath) {
  try {
    return fs.realpathSync(targetPath);
  } catch {
    return path.resolve(targetPath);
  }
}

function safeMode(targetPath) {
  try {
    return (fs.statSync(targetPath).mode & 0o777).toString(8).padStart(3, "0");
  } catch {
    return null;
  }
}

function collectWorkspaceMemoryStats() {
  const memoryDir = path.join(WORKSPACE_DIR, "memory");
  let dailyFiles = 0;
  try {
    const entries = fs.readdirSync(memoryDir, { withFileTypes: true });
    dailyFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".md")).length;
  } catch {
    dailyFiles = 0;
  }

  return {
    rootMemoryPresent: fs.existsSync(path.join(WORKSPACE_DIR, "MEMORY.md")),
    altMemoryPresent: fs.existsSync(path.join(WORKSPACE_DIR, "memory.md")),
    dailyFiles,
    totalFiles:
      (fs.existsSync(path.join(WORKSPACE_DIR, "MEMORY.md")) ? 1 : 0) +
      (fs.existsSync(path.join(WORKSPACE_DIR, "memory.md")) ? 1 : 0) +
      dailyFiles,
  };
}

const QMD_INDEX_SQLITE_PATH = path.join(
  STATE_DIR,
  "agents",
  "main",
  "qmd",
  "xdg-cache",
  "qmd",
  "index.sqlite",
);

const WORKSPACE_QMD_SQLITE_LINK = path.join(WORKSPACE_DIR, "qmd-index.sqlite");
const WORKSPACE_SQLITE_SOURCES_DOC = path.join(WORKSPACE_DIR, "SQLITE_SOURCES.md");
const WEB_AUTH_STORE_PATH = path.join(STATE_DIR, "web-auth-users.json");
const WEB_NOTES_STORE_PATH = path.join(STATE_DIR, "web-notes.json");
const WEB_HIGHLIGHTS_STORE_PATH = path.join(STATE_DIR, "web-highlights.json");
const WEB_BOOKMARKS_STORE_PATH = path.join(STATE_DIR, "web-bookmarks.json");
const WEB_PROGRESS_STORE_PATH = path.join(STATE_DIR, "web-progress.json");
const WEB_PLAYBOOKS_STORE_PATH = path.join(STATE_DIR, "web-playbooks.json");
const WEB_RATE_LIMITS_STORE_PATH = path.join(STATE_DIR, "web-rate-limits.json");
const WEB_AUDIT_LOG_STORE_PATH = path.join(STATE_DIR, "web-audit-log.json");
const WEB_BOOK_SECTIONS_STORE_PATH = path.join(STATE_DIR, "web-book-sections.json");
const WEB_BOOK_TOC_STORE_PATH = path.join(STATE_DIR, "web-book-toc.json");
const OPENCLAW_PACKAGE_ROOT = process.env.OPENCLAW_PACKAGE_ROOT?.trim() || "/openclaw";
const OPENCLAW_PACKAGE_JSON = path.join(OPENCLAW_PACKAGE_ROOT, "package.json");
const ADMIN_OAUTH_FLOW_TIMEOUT_MS = 10 * 60 * 1000;
const ANTHROPIC_SETUP_TOKEN_PREFIX = "sk-ant-oat01-";
const ANTHROPIC_SETUP_TOKEN_MIN_LENGTH = 80;
const DEFAULT_ANTHROPIC_MODEL_REF = "anthropic/claude-sonnet-4-6";
const OPENAI_CODEX_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const OPENAI_CODEX_AUTHORIZE_URL = "https://auth.openai.com/oauth/authorize";
const OPENAI_CODEX_TOKEN_URL = "https://auth.openai.com/oauth/token";
const OPENAI_CODEX_SCOPE = "openid profile email offline_access";
const OPENAI_CODEX_REDIRECT_URI = "http://localhost:1455/auth/callback";
const OPENAI_CODEX_JWT_CLAIM_PATH = "https://api.openai.com/auth";

function hashPassword(password) {
  return crypto.createHash("sha256").update(String(password)).digest("hex");
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function readWebAuthUsers() {
  try {
    const raw = fs.readFileSync(WEB_AUTH_STORE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.users)) return [];
    return parsed.users.filter((user) => user && typeof user === "object");
  } catch {
    return [];
  }
}

function writeWebAuthUsers(users) {
  fs.mkdirSync(path.dirname(WEB_AUTH_STORE_PATH), { recursive: true });
  const payload = {
    version: 1,
    users,
  };
  const tempPath = `${WEB_AUTH_STORE_PATH}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2), "utf8");
  fs.renameSync(tempPath, WEB_AUTH_STORE_PATH);
}

function countWebAuthUsers() {
  return readWebAuthUsers().length;
}

function findWebAuthUserByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const users = readWebAuthUsers();
  return users.find((user) => normalizeEmail(user.email) === normalized) || null;
}

function registerInitialWebAdmin({ name, email, password }) {
  const users = readWebAuthUsers();
  if (users.length > 0) {
    return { ok: false, code: "onboarding_closed", message: "Initial admin already exists" };
  }

  const normalizedEmail = normalizeEmail(email);
  if (!name || !normalizedEmail || !password) {
    return { ok: false, code: "invalid_request", message: "name, email, and password are required" };
  }

  const now = new Date().toISOString();
  const user = {
    id: crypto.randomUUID(),
    name: String(name).trim(),
    email: normalizedEmail,
    role: "admin",
    password_hash: hashPassword(password),
    created_at: now,
    updated_at: now,
    last_login_at: null,
  };

  writeWebAuthUsers([user]);
  return { ok: true, user };
}

function verifyWebAuthCredentials({ email, password }) {
  const normalizedEmail = normalizeEmail(email);
  const user = findWebAuthUserByEmail(normalizedEmail);
  if (!user) return { ok: false, code: "invalid_credentials", user: null };

  const incomingHash = hashPassword(password);
  const storedHash = typeof user.password_hash === "string" ? user.password_hash : "";
  const storedPlain = typeof user.password === "string" ? user.password : "";
  if (storedHash !== incomingHash && storedPlain !== String(password)) {
    return { ok: false, code: "invalid_credentials", user: null };
  }

  const users = readWebAuthUsers();
  const now = new Date().toISOString();
  const nextUsers = users.map((candidate) => {
    if (candidate.id !== user.id) return candidate;
    return {
      ...candidate,
      last_login_at: now,
      updated_at: now,
    };
  });
  writeWebAuthUsers(nextUsers);

  const fresh = nextUsers.find((candidate) => candidate.id === user.id) || user;
  return {
    ok: true,
    code: "ok",
    user: {
      id: fresh.id,
      name: fresh.name,
      email: fresh.email,
      role: fresh.role === "admin" ? "admin" : "user",
    },
  };
}

function readWebNotes() {
  try {
    const raw = fs.readFileSync(WEB_NOTES_STORE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.notes)) return [];
    return parsed.notes.filter((note) => note && typeof note === "object");
  } catch {
    return [];
  }
}

function writeWebNotes(notes) {
  fs.mkdirSync(path.dirname(WEB_NOTES_STORE_PATH), { recursive: true });
  const payload = {
    version: 1,
    notes,
  };
  const tempPath = `${WEB_NOTES_STORE_PATH}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2), "utf8");
  fs.renameSync(tempPath, WEB_NOTES_STORE_PATH);
}

function readWebHighlights() {
  try {
    const raw = fs.readFileSync(WEB_HIGHLIGHTS_STORE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.highlights)) return [];
    return parsed.highlights.filter((highlight) => highlight && typeof highlight === "object");
  } catch {
    return [];
  }
}

function writeWebHighlights(highlights) {
  fs.mkdirSync(path.dirname(WEB_HIGHLIGHTS_STORE_PATH), { recursive: true });
  const payload = {
    version: 1,
    highlights,
  };
  const tempPath = `${WEB_HIGHLIGHTS_STORE_PATH}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2), "utf8");
  fs.renameSync(tempPath, WEB_HIGHLIGHTS_STORE_PATH);
}

function normalizeHighlightRecord(highlight) {
  return {
    id: highlight.id,
    user_id: highlight.user_id,
    section_slug: highlight.section_slug,
    anchor_id: highlight.anchor_id ?? null,
    range_start: highlight.range_start,
    range_end: highlight.range_end,
    text: highlight.text,
    color: highlight.color ?? "yellow",
    note_id: highlight.note_id ?? null,
    created_at: highlight.created_at,
  };
}

function readWebBookmarks() {
  try {
    const raw = fs.readFileSync(WEB_BOOKMARKS_STORE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.bookmarks)) return [];
    return parsed.bookmarks.filter((bookmark) => bookmark && typeof bookmark === "object");
  } catch {
    return [];
  }
}

function writeWebBookmarks(bookmarks) {
  fs.mkdirSync(path.dirname(WEB_BOOKMARKS_STORE_PATH), { recursive: true });
  const payload = {
    version: 1,
    bookmarks,
  };
  const tempPath = `${WEB_BOOKMARKS_STORE_PATH}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2), "utf8");
  fs.renameSync(tempPath, WEB_BOOKMARKS_STORE_PATH);
}

function readWebProgress() {
  try {
    const raw = fs.readFileSync(WEB_PROGRESS_STORE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.progress)) return [];
    return parsed.progress.filter((item) => item && typeof item === "object");
  } catch {
    return [];
  }
}

function writeWebProgress(progress) {
  fs.mkdirSync(path.dirname(WEB_PROGRESS_STORE_PATH), { recursive: true });
  const payload = {
    version: 1,
    progress,
  };
  const tempPath = `${WEB_PROGRESS_STORE_PATH}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2), "utf8");
  fs.renameSync(tempPath, WEB_PROGRESS_STORE_PATH);
}

function normalizeProgressRecord(item) {
  return {
    id: item.id,
    user_id: item.user_id,
    section_slug: item.section_slug,
    percent: item.percent,
    last_anchor_id: item.last_anchor_id ?? null,
    updated_at: item.updated_at,
  };
}

function readWebPlaybooks() {
  try {
    const raw = fs.readFileSync(WEB_PLAYBOOKS_STORE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.playbooks)) return [];
    return parsed.playbooks.filter((item) => item && typeof item === "object");
  } catch {
    return [];
  }
}

function writeWebPlaybooks(playbooks) {
  fs.mkdirSync(path.dirname(WEB_PLAYBOOKS_STORE_PATH), { recursive: true });
  const payload = {
    version: 1,
    playbooks,
  };
  const tempPath = `${WEB_PLAYBOOKS_STORE_PATH}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2), "utf8");
  fs.renameSync(tempPath, WEB_PLAYBOOKS_STORE_PATH);
}

function normalizePlaybookRecord(item) {
  return {
    id: item.id,
    status: item.status,
    title: item.title,
    triggers: item.triggers ?? "[]",
    checklist: item.checklist ?? "[]",
    scenario_tree: item.scenario_tree ?? "",
    linked_sections: item.linked_sections ?? "[]",
    tags: item.tags ?? "[]",
    created_by: item.created_by,
    created_at: item.created_at,
    updated_at: item.updated_at,
    published_at: item.published_at ?? null,
  };
}

function readWebRateLimits() {
  try {
    const raw = fs.readFileSync(WEB_RATE_LIMITS_STORE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.entries)) return [];
    return parsed.entries.filter((item) => item && typeof item === "object");
  } catch {
    return [];
  }
}

function writeWebRateLimits(entries) {
  fs.mkdirSync(path.dirname(WEB_RATE_LIMITS_STORE_PATH), { recursive: true });
  const payload = {
    version: 1,
    entries,
  };
  const tempPath = `${WEB_RATE_LIMITS_STORE_PATH}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2), "utf8");
  fs.renameSync(tempPath, WEB_RATE_LIMITS_STORE_PATH);
}

function incrementWebRateLimit(key, windowStart) {
  const entries = readWebRateLimits();
  const idx = entries.findIndex(
    (item) => item.key === key && Number(item.window_start) === Number(windowStart),
  );

  let count = 1;
  if (idx >= 0) {
    count = Number(entries[idx].count || 0) + 1;
    entries[idx] = {
      ...entries[idx],
      count,
      updated_at: new Date().toISOString(),
    };
  } else {
    entries.push({
      key,
      window_start: windowStart,
      count,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  writeWebRateLimits(entries);
  return count;
}

function readWebAuditLog() {
  try {
    const raw = fs.readFileSync(WEB_AUDIT_LOG_STORE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.events)) return [];
    return parsed.events.filter((item) => item && typeof item === "object");
  } catch {
    return [];
  }
}

function writeWebAuditLog(events) {
  fs.mkdirSync(path.dirname(WEB_AUDIT_LOG_STORE_PATH), { recursive: true });
  const payload = {
    version: 1,
    events,
  };
  const tempPath = `${WEB_AUDIT_LOG_STORE_PATH}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2), "utf8");
  fs.renameSync(tempPath, WEB_AUDIT_LOG_STORE_PATH);
}

function appendWebAuditEvent(event) {
  const events = readWebAuditLog();
  events.push(event);
  writeWebAuditLog(events);
}

function findLastWebAuditByAction(action) {
  const events = readWebAuditLog();
  const match = events
    .filter((event) => event.action === action)
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))[0];
  return match || null;
}

function findWebAuthUserById(id) {
  if (!id) return null;
  const users = readWebAuthUsers();
  return users.find((user) => user.id === id) || null;
}

function readWebBookSections() {
  try {
    const raw = fs.readFileSync(WEB_BOOK_SECTIONS_STORE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.sections)) return [];
    return parsed.sections.filter((item) => item && typeof item === "object");
  } catch {
    return [];
  }
}

function readWebBookToc() {
  try {
    const raw = fs.readFileSync(WEB_BOOK_TOC_STORE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed;
    return {};
  } catch {
    return {};
  }
}

function getPublishedSectionsOrdered() {
  return readWebBookSections()
    .filter((item) => (item.status || "published") === "published")
    .sort((a, b) => {
      const ap = Number(a.part_index ?? 0);
      const bp = Number(b.part_index ?? 0);
      if (ap !== bp) return ap - bp;

      const ac = Number(a.chapter_index ?? 0);
      const bc = Number(b.chapter_index ?? 0);
      if (ac !== bc) return ac - bc;

      const as = Number(a.section_index ?? 0);
      const bs = Number(b.section_index ?? 0);
      if (as !== bs) return as - bs;

      return String(a.slug || "").localeCompare(String(b.slug || ""));
    });
}

function normalizeNoteRecord(note) {
  return {
    id: note.id,
    user_id: note.user_id,
    section_slug: note.section_slug,
    anchor_id: note.anchor_id ?? null,
    selection: note.selection ?? null,
    title: note.title ?? null,
    body: note.body,
    tags: note.tags ?? "[]",
    created_at: note.created_at,
    updated_at: note.updated_at,
  };
}

function getInternalUserContext(req, res) {
  const userIdHeader = req.headers["x-user-id"];
  const roleHeader = req.headers["x-user-role"];
  const userId = typeof userIdHeader === "string" ? userIdHeader.trim() : "";
  const role = roleHeader === "admin" ? "admin" : "user";

  if (!userId) {
    res.status(400).json({
      ok: false,
      error: {
        code: "missing_user_context",
        message: "x-user-id header is required",
      },
    });
    return null;
  }

  return { userId, role };
}

function syncWorkspaceSqliteScaffold() {
  fs.mkdirSync(WORKSPACE_DIR, { recursive: true });

  const qmdExists = fs.existsSync(QMD_INDEX_SQLITE_PATH);
  const lines = [
    "# SQLite Sources",
    "",
    "This workspace exposes SQLite locations used by OpenClaw runtime.",
    "",
    "- qmd-index.sqlite (symlink in workspace)",
    `  - target: ${QMD_INDEX_SQLITE_PATH}`,
    `  - target_exists: ${qmdExists ? "yes" : "no"}`,
    "- web service sqlite path: /data/web.db",
    "  - note: lives in the web service container filesystem, not this core container",
  ];
  fs.writeFileSync(WORKSPACE_SQLITE_SOURCES_DOC, `${lines.join("\n")}\n`, "utf8");

  try {
    const stat = fs.lstatSync(WORKSPACE_QMD_SQLITE_LINK);
    if (!stat.isSymbolicLink()) {
      fs.rmSync(WORKSPACE_QMD_SQLITE_LINK, { force: true });
    }
  } catch {
    // missing path is expected on first boot
  }

  try {
    const linked = fs.readlinkSync(WORKSPACE_QMD_SQLITE_LINK);
    if (linked !== QMD_INDEX_SQLITE_PATH) {
      fs.rmSync(WORKSPACE_QMD_SQLITE_LINK, { force: true });
      fs.symlinkSync(QMD_INDEX_SQLITE_PATH, WORKSPACE_QMD_SQLITE_LINK);
    }
    return;
  } catch {
    // link missing or unreadable, create it below
  }

  try {
    fs.symlinkSync(QMD_INDEX_SQLITE_PATH, WORKSPACE_QMD_SQLITE_LINK);
  } catch {
    // Non-fatal: workspace doc still provides deterministic paths.
  }
}

function clawArgs(args) {
  return [OPENCLAW_ENTRY, ...args];
}

function resolveConfigCandidates() {
  const explicit = process.env.OPENCLAW_CONFIG_PATH?.trim();
  if (explicit) return [explicit];

  return [path.join(STATE_DIR, "openclaw.json")];
}

function configPath() {
  const candidates = resolveConfigCandidates();
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      // ignore
    }
  }
  // Default to canonical even if it doesn't exist yet.
  return candidates[0] || path.join(STATE_DIR, "openclaw.json");
}

function isConfigured() {
  try {
    return resolveConfigCandidates().some((candidate) => fs.existsSync(candidate));
  } catch {
    return false;
  }
}

function cloneJsonValue(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function readConfigJsonFromDisk() {
  const targetPath = configPath();
  const raw = fs.readFileSync(targetPath, "utf8");
  const parsed = raw.trim() ? JSON.parse(raw) : {};
  return {
    path: targetPath,
    config: parsed && typeof parsed === "object" ? parsed : {},
  };
}

function setConfigValue(target, dottedPath, value) {
  const parts = String(dottedPath || "")
    .split(".")
    .filter(Boolean);
  if (parts.length === 0) {
    throw new Error(`Invalid config path: ${dottedPath}`);
  }

  let cursor = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index];
    const current = cursor[key];
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      cursor[key] = {};
    }
    cursor = cursor[key];
  }

  cursor[parts[parts.length - 1]] = cloneJsonValue(value);
}

function deleteConfigValue(target, dottedPath) {
  const parts = String(dottedPath || "")
    .split(".")
    .filter(Boolean);
  if (parts.length === 0) {
    throw new Error(`Invalid config path: ${dottedPath}`);
  }

  let cursor = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index];
    const current = cursor?.[key];
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return false;
    }
    cursor = current;
  }

  const leaf = parts[parts.length - 1];
  if (!Object.prototype.hasOwnProperty.call(cursor, leaf)) {
    return false;
  }

  delete cursor[leaf];
  return true;
}

function applyConfigPatch(entries) {
  try {
    const snapshot = readConfigJsonFromDisk();
    const nextConfig = cloneJsonValue(snapshot.config) || {};

    for (const [dottedPath, value] of entries) {
      setConfigValue(nextConfig, dottedPath, value);
    }

    const nextRaw = `${JSON.stringify(nextConfig, null, 2)}\n`;
    const currentRaw = `${JSON.stringify(snapshot.config, null, 2)}\n`;
    if (nextRaw === currentRaw) {
      return {
        ok: true,
        changed: false,
        path: snapshot.path,
        output: `[config] unchanged ${snapshot.path}`,
      };
    }

    fs.mkdirSync(path.dirname(snapshot.path), { recursive: true });
    const tempPath = `${snapshot.path}.tmp`;
    fs.writeFileSync(tempPath, nextRaw, { encoding: "utf8", mode: 0o600 });
    fs.renameSync(tempPath, snapshot.path);

    return {
      ok: true,
      changed: true,
      path: snapshot.path,
      output: `[config] updated ${snapshot.path}`,
    };
  } catch (err) {
    return {
      ok: false,
      changed: false,
      path: configPath(),
      output: `[config] patch failed: ${String(err)}`,
    };
  }
}

function removeConfigKeys(dottedPaths) {
  try {
    const snapshot = readConfigJsonFromDisk();
    const nextConfig = cloneJsonValue(snapshot.config) || {};
    const removed = [];

    for (const dottedPath of dottedPaths) {
      if (deleteConfigValue(nextConfig, dottedPath)) {
        removed.push(dottedPath);
      }
    }

    if (removed.length === 0) {
      return {
        ok: true,
        changed: false,
        removed,
        path: snapshot.path,
        output: `[config] unchanged ${snapshot.path}`,
      };
    }

    const nextRaw = `${JSON.stringify(nextConfig, null, 2)}\n`;
    fs.mkdirSync(path.dirname(snapshot.path), { recursive: true });
    const tempPath = `${snapshot.path}.tmp`;
    fs.writeFileSync(tempPath, nextRaw, { encoding: "utf8", mode: 0o600 });
    fs.renameSync(tempPath, snapshot.path);

    return {
      ok: true,
      changed: true,
      removed,
      path: snapshot.path,
      output: `[config] removed ${removed.join(", ")} from ${snapshot.path}`,
    };
  } catch (err) {
    return {
      ok: false,
      changed: false,
      removed: [],
      path: configPath(),
      output: `[config] cleanup failed: ${String(err)}`,
    };
  }
}

// One-time migration: rename legacy config files to openclaw.json so existing
// deployments that still have the old filename on their volume keep working.
(function migrateLegacyConfigFile() {
  // If the operator explicitly chose a config path, do not rename files in STATE_DIR.
  if (process.env.OPENCLAW_CONFIG_PATH?.trim()) return;

  const canonical = path.join(STATE_DIR, "openclaw.json");
  if (fs.existsSync(canonical)) return;

  for (const legacy of ["moltbot.json"]) {
    const legacyPath = path.join(STATE_DIR, legacy);
    try {
      if (fs.existsSync(legacyPath)) {
        fs.renameSync(legacyPath, canonical);
        console.log(`[migration] Renamed ${legacy} → openclaw.json`);
        return;
      }
    } catch (err) {
      console.warn(`[migration] Failed to rename ${legacy}: ${err}`);
    }
  }
})();

(function scrubLegacyConfigKeys() {
  if (!isConfigured()) return;

  const cleanup = removeConfigKeys(["memory.qmd.searchMode"]);
  if (!cleanup.ok) {
    console.warn(`[migration] Failed to scrub legacy config keys: ${cleanup.output}`);
    return;
  }
  if (cleanup.changed) {
    console.log(`[migration] Scrubbed legacy config keys: ${cleanup.removed.join(", ")}`);
  }
})();

(function scrubLegacyQmdWorkspaceState() {
  const agentsRoot = path.join(STATE_DIR, "agents");
  let agentDirs = [];
  try {
    agentDirs = fs
      .readdirSync(agentsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return;
  }

  for (const agentId of agentDirs) {
    const qmdConfigDir = path.join(agentsRoot, agentId, "qmd", "xdg-config", "qmd");
    let configFiles = [];
    try {
      configFiles = fs
        .readdirSync(qmdConfigDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith(".yml"))
        .map((entry) => path.join(qmdConfigDir, entry.name));
    } catch {
      continue;
    }

    let needsReset = false;
    for (const configFile of configFiles) {
      try {
        const content = fs.readFileSync(configFile, "utf8");
        if (/^\s{2}workspace-[^:\r\n]+:/m.test(content) || content.includes("/data/workspace/_debug.json")) {
          needsReset = true;
          break;
        }
      } catch {
        // ignore unreadable config files
      }
    }

    if (!needsReset) {
      continue;
    }

    for (const configFile of configFiles) {
      try {
        fs.rmSync(configFile, { force: true });
      } catch (err) {
        console.warn(`[migration] Failed to remove stale QMD config ${configFile}: ${String(err)}`);
      }
    }

    const qmdCacheDir = path.join(agentsRoot, agentId, "qmd", "xdg-cache", "qmd");
    for (const cacheFile of ["index.sqlite", "index.sqlite-shm", "index.sqlite-wal"]) {
      const cachePath = path.join(qmdCacheDir, cacheFile);
      try {
        fs.rmSync(cachePath, { force: true });
      } catch (err) {
        console.warn(`[migration] Failed to remove stale QMD cache ${cachePath}: ${String(err)}`);
      }
    }

    console.log(`[migration] Reset stale QMD workspace state for agent ${agentId}`);
  }
})();

let gatewayProc = null;
let gatewayStarting = null;
let gatewayDesired = false;
let gatewayRestartTimer = null;
let gatewayRestartAttempts = 0;
let lastGatewayOutput = "";
let claudeMaxProxyProc = null;
let claudeMaxProxyStarting = null;
let claudeMaxProxyDesired = false;
let lastClaudeMaxProxyError = null;
let lastClaudeMaxProxyExit = null;
let lastClaudeMaxProxyOutput = "";

// Debug breadcrumbs for common Railway failures (502 / "Application failed to respond").
let lastGatewayError = null;
let lastGatewayExit = null;
let lastDoctorOutput = null;
let lastDoctorAt = null;
let memoryIndexWarmup = null;
let lastProxyUnavailableLogAt = 0;

function isGatewayProcessConflict(text) {
  const value = String(text || "");
  return /gateway already running|Port \d+ is already in use|lock timeout after \d+ms/i.test(value);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function appendGatewayOutput(stream, chunk) {
  const text = String(chunk || "");
  if (!text) return;
  const stamped = `[${new Date().toISOString()}][${stream}] ${text}`;
  lastGatewayOutput += stamped;
  if (lastGatewayOutput.length > 80_000) {
    lastGatewayOutput = lastGatewayOutput.slice(-80_000);
  }
}

function appendClaudeMaxProxyOutput(stream, chunk) {
  const text = String(chunk || "");
  if (!text) return;
  const stamped = `[${new Date().toISOString()}][claude-max:${stream}] ${text}`;
  lastClaudeMaxProxyOutput += stamped;
  if (lastClaudeMaxProxyOutput.length > 80_000) {
    lastClaudeMaxProxyOutput = lastClaudeMaxProxyOutput.slice(-80_000);
  }
}

async function probeClaudeMaxProxy() {
  try {
    const res = await fetch(CLAUDE_MAX_PROXY_HEALTH_URL, { method: "GET" });
    return Boolean(res && res.ok);
  } catch {
    return false;
  }
}

async function waitForClaudeMaxProxyReady(timeoutMs = 30_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await probeClaudeMaxProxy()) {
      return true;
    }
    await sleep(250);
  }
  return false;
}

function resolveConfiguredClaudeMaxProxyState() {
  const result = {
    configured: false,
    providerId: CLAUDE_MAX_PROXY_PROVIDER_ID,
    defaultModel: buildClaudeMaxProxyModelRef(),
    baseUrl: CLAUDE_MAX_PROXY_BASE_URL,
  };

  if (!isConfigured()) {
    return result;
  }

  try {
    const snapshot = readConfigJsonFromDisk();
    const providerCfg = getJsonValue(snapshot.config, `models.providers.${CLAUDE_MAX_PROXY_PROVIDER_ID}`);
    const modelPrimary = String(getJsonValue(snapshot.config, "agents.defaults.model.primary") || "").trim();
    const configuredBaseUrl = String(providerCfg?.baseUrl || "").trim();
    const configuredModel = modelPrimary.startsWith(`${CLAUDE_MAX_PROXY_PROVIDER_ID}/`)
      ? modelPrimary
      : buildClaudeMaxProxyModelRef();

    return {
      configured:
        Boolean(providerCfg && typeof providerCfg === "object") ||
        modelPrimary.startsWith(`${CLAUDE_MAX_PROXY_PROVIDER_ID}/`),
      providerId: CLAUDE_MAX_PROXY_PROVIDER_ID,
      defaultModel: configuredModel,
      baseUrl: configuredBaseUrl || CLAUDE_MAX_PROXY_BASE_URL,
    };
  } catch {
    return result;
  }
}

async function inspectClaudeMaxProxyStatus() {
  const configState = resolveConfiguredClaudeMaxProxyState();
  const proxyReachable = await probeClaudeMaxProxy();
  const claudeCli = runSyncCommand(CLAUDE_CLI_COMMAND, ["--version"]);
  const proxyCli = runSyncCommand(CLAUDE_MAX_PROXY_COMMAND, ["--help"]);

  return {
    ...configState,
    command: CLAUDE_MAX_PROXY_COMMAND,
    claudeCommand: CLAUDE_CLI_COMMAND,
    cliStateDir: CLAUDE_MAX_PROXY_CLI_STATE_DIR,
    reachable: proxyReachable,
    running: Boolean(claudeMaxProxyProc) || proxyReachable,
    commands: {
      claude: {
        present: claudeCli.ok,
        output: redactSecrets(claudeCli.output),
      },
      proxy: {
        present: proxyCli.ok,
        output: redactSecrets(proxyCli.output),
      },
    },
    lastError: lastClaudeMaxProxyError,
    lastExit: lastClaudeMaxProxyExit,
    lastOutput: redactSecrets(lastClaudeMaxProxyOutput),
  };
}

async function startClaudeMaxProxy() {
  if (claudeMaxProxyProc) return;

  const desired = resolveConfiguredClaudeMaxProxyState();
  if (!desired.configured) {
    claudeMaxProxyDesired = false;
    return;
  }

  const claudeCli = runSyncCommand(CLAUDE_CLI_COMMAND, ["--version"]);
  if (!claudeCli.ok) {
    throw new Error(
      `Claude Max proxy requires ${CLAUDE_CLI_COMMAND}. Install Claude Code CLI and complete login before enabling ${CLAUDE_MAX_PROXY_PROVIDER_ID}.`,
    );
  }

  const proxyCli = runSyncCommand(CLAUDE_MAX_PROXY_COMMAND, ["--help"]);
  if (!proxyCli.ok) {
    throw new Error(
      `Claude Max proxy requires ${CLAUDE_MAX_PROXY_COMMAND}. Install claude-max-api-proxy in the core image before enabling ${CLAUDE_MAX_PROXY_PROVIDER_ID}.`,
    );
  }

  fs.mkdirSync(CLAUDE_MAX_PROXY_CLI_STATE_DIR, { recursive: true });

  claudeMaxProxyProc = childProcess.spawn(CLAUDE_MAX_PROXY_COMMAND, [], {
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      HOME: os.homedir(),
      CLAUDE_CONFIG_DIR: CLAUDE_MAX_PROXY_CLI_STATE_DIR,
      DISABLE_AUTOUPDATER: "1",
    },
  });

  claudeMaxProxyProc.stdout?.on("data", (chunk) => {
    appendClaudeMaxProxyOutput("stdout", chunk);
    try {
      process.stdout.write(chunk);
    } catch {
      // ignore
    }
  });

  claudeMaxProxyProc.stderr?.on("data", (chunk) => {
    appendClaudeMaxProxyOutput("stderr", chunk);
    try {
      process.stderr.write(chunk);
    } catch {
      // ignore
    }
  });

  claudeMaxProxyProc.on("error", (err) => {
    void (async () => {
      const msg = `[claude-max] spawn error: ${String(err)}`;
      console.error(msg);
      lastClaudeMaxProxyError = msg;
      claudeMaxProxyProc = null;
      if (await probeClaudeMaxProxy()) {
        lastClaudeMaxProxyError = null;
      }
    })();
  });

  claudeMaxProxyProc.on("exit", (code, signal) => {
    const msg = `[claude-max] exited code=${code} signal=${signal}`;
    console.error(msg);
    lastClaudeMaxProxyExit = { code, signal, at: new Date().toISOString() };
    lastClaudeMaxProxyError = msg;
    claudeMaxProxyProc = null;
  });
}

async function stopClaudeMaxProxy({ disableDesired = true } = {}) {
  if (disableDesired) claudeMaxProxyDesired = false;
  const proc = claudeMaxProxyProc;
  if (!proc) return;
  await terminateGatewayProcess(proc, "SIGTERM");
  await sleep(750);
  await terminateGatewayProcess(proc, "SIGKILL");
  claudeMaxProxyProc = null;
}

async function syncClaudeMaxProxyState() {
  const desired = resolveConfiguredClaudeMaxProxyState();
  claudeMaxProxyDesired = desired.configured;

  if (!desired.configured) {
    await stopClaudeMaxProxy();
    lastClaudeMaxProxyError = null;
    return { ok: true, configured: false, output: "[claude-max] disabled (not configured)" };
  }

  if (await probeClaudeMaxProxy()) {
    lastClaudeMaxProxyError = null;
    return { ok: true, configured: true, output: "[claude-max] already reachable" };
  }

  if (!claudeMaxProxyStarting) {
    claudeMaxProxyStarting = (async () => {
      try {
        await startClaudeMaxProxy();
        const ready = await waitForClaudeMaxProxyReady();
        if (!ready) {
          throw new Error(
            `Claude Max proxy did not become ready in time at ${CLAUDE_MAX_PROXY_HEALTH_URL}. Log in with ${CLAUDE_CLI_COMMAND} and retry.`,
          );
        }
        lastClaudeMaxProxyError = null;
        return { ok: true, configured: true, output: "[claude-max] reachable" };
      } catch (err) {
        const msg = `[claude-max] start failure: ${String(err)}`;
        lastClaudeMaxProxyError = msg;
        return { ok: false, configured: true, output: msg };
      } finally {
        claudeMaxProxyStarting = null;
      }
    })();
  }

  return claudeMaxProxyStarting;
}

function clearGatewayRestartTimer() {
  if (!gatewayRestartTimer) return;
  clearTimeout(gatewayRestartTimer);
  gatewayRestartTimer = null;
}

async function terminateGatewayProcess(proc, signal = "SIGTERM") {
  if (!proc?.pid) return;

  if (process.platform === "win32") {
    try {
      childProcess.spawnSync("taskkill", ["/PID", String(proc.pid), "/T", "/F"], {
        stdio: "ignore",
      });
      return;
    } catch {
      // Fall back to a direct kill below.
    }
  } else if (proc.pid > 0) {
    try {
      process.kill(-proc.pid, signal);
      return;
    } catch {
      // Fall back to the launcher PID below.
    }
  }

  try {
    proc.kill(signal);
  } catch {
    // ignore
  }
}

function scheduleGatewayRestart(reason) {
  if (!gatewayDesired || gatewayRestartTimer || !isConfigured()) return;

  const delayMs = Math.min(15_000, 1_000 * 2 ** Math.min(gatewayRestartAttempts, 4));
  gatewayRestartAttempts += 1;

  lastGatewayError = `[gateway] scheduling restart in ${delayMs}ms after ${reason}`;
  gatewayRestartTimer = setTimeout(async () => {
    gatewayRestartTimer = null;
    try {
      await ensureGatewayRunning();
    } catch (err) {
      lastGatewayError = `[gateway] auto-restart failed: ${String(err)}`;
      scheduleGatewayRestart("failed restart");
    }
  }, delayMs);
  gatewayRestartTimer.unref?.();
}

async function waitForGatewayReady(opts = {}) {
  const timeoutMs = opts.timeoutMs ?? OPENCLAW_GATEWAY_READY_TIMEOUT_MS;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      // Try the default Control UI base path, then fall back to root.
      const paths = ["/openclaw", "/"];
      for (const p of paths) {
        try {
          const res = await fetch(`${GATEWAY_TARGET}${p}`, { method: "GET" });
          // Any HTTP response means the port is open.
          if (res) return true;
        } catch {
          // try next
        }
      }
    } catch {
      // not ready
    }
    await sleep(250);
  }
  return false;
}

async function startGateway() {
  if (gatewayProc) return;
  if (!isConfigured()) throw new Error("Gateway cannot start: not configured");

  clearGatewayRestartTimer();

  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.mkdirSync(WORKSPACE_DIR, { recursive: true });

  const args = [
    "gateway",
    "run",
    "--force",
    "--bind",
    "loopback",
    "--port",
    String(INTERNAL_GATEWAY_PORT),
    "--auth",
    "token",
    "--token",
    OPENCLAW_GATEWAY_TOKEN,
  ];

  gatewayProc = childProcess.spawn(OPENCLAW_NODE, clawArgs(args), {
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      NODE_OPTIONS: process.env.NODE_OPTIONS || "--max-old-space-size=1024",
      OPENCLAW_STATE_DIR: STATE_DIR,
      OPENCLAW_WORKSPACE_DIR: WORKSPACE_DIR,
    },
  });

  gatewayProc.stdout?.on("data", (chunk) => {
    appendGatewayOutput("stdout", chunk);
    try {
      process.stdout.write(chunk);
    } catch {
      // ignore
    }
  });

  gatewayProc.stderr?.on("data", (chunk) => {
    appendGatewayOutput("stderr", chunk);
    try {
      process.stderr.write(chunk);
    } catch {
      // ignore
    }
  });

  gatewayProc.on("error", (err) => {
    void (async () => {
      const msg = `[gateway] spawn error: ${String(err)}`;
      console.error(msg);
      lastGatewayError = msg;
      gatewayProc = null;

      const reachable = await probeGateway().catch(() => false);
      if (reachable) {
        gatewayRestartAttempts = 0;
        lastGatewayError = null;
        return;
      }

      scheduleGatewayRestart("spawn error");
    })();
  });

  gatewayProc.on("exit", (code, signal) => {
    void (async () => {
      const msg = `[gateway] exited code=${code} signal=${signal}`;
      console.error(msg);
      lastGatewayExit = { code, signal, at: new Date().toISOString() };
      gatewayProc = null;
      if (code === 0 || signal === "SIGTERM") {
        gatewayRestartAttempts = 0;
        return;
      }

      const combined = [msg, lastGatewayError, lastGatewayOutput].filter(Boolean).join("\n");
      const reachable = await probeGateway().catch(() => false);
      if (reachable || isGatewayProcessConflict(combined)) {
        gatewayRestartAttempts = 0;
        lastGatewayError = null;
        return;
      }

      runDoctorBestEffort().catch(() => {});
      scheduleGatewayRestart(`exit code=${code} signal=${signal}`);
    })();
  });
}

async function stopGateway({ disableDesired = true } = {}) {
  if (disableDesired) gatewayDesired = false;
  clearGatewayRestartTimer();

  const proc = gatewayProc;
  if (!proc) return;
  await terminateGatewayProcess(proc, "SIGTERM");
  await sleep(750);
  await terminateGatewayProcess(proc, "SIGKILL");
  gatewayProc = null;
}

async function runDoctorBestEffort() {
  // Avoid spamming `openclaw doctor` in a crash loop.
  const now = Date.now();
  if (lastDoctorAt && now - lastDoctorAt < 5 * 60 * 1000) return;
  lastDoctorAt = now;

  try {
    const r = await runCmd(OPENCLAW_NODE, clawArgs(["doctor"]));
    const out = redactSecrets(r.output || "");
    lastDoctorOutput = out.length > 50_000 ? out.slice(0, 50_000) + "\n... (truncated)\n" : out;
  } catch (err) {
    lastDoctorOutput = `doctor failed: ${String(err)}`;
  }
}

async function ensureGatewayRunning() {
  if (!isConfigured()) {
    gatewayDesired = false;
    return { ok: false, reason: "not configured" };
  }
  gatewayDesired = true;
  if (gatewayProc) return { ok: true };
  if (!gatewayStarting) {
    gatewayStarting = (async () => {
      try {
        lastGatewayError = null;
        await startGateway();
        const ready = await waitForGatewayReady({ timeoutMs: OPENCLAW_GATEWAY_READY_TIMEOUT_MS });
        if (!ready) {
          const reachableAfterTimeout = await probeGateway().catch(() => false);
          if (reachableAfterTimeout) {
            gatewayRestartAttempts = 0;
            lastGatewayError = null;
            return;
          }
          throw new Error("Gateway did not become ready in time");
        }
        gatewayRestartAttempts = 0;
      } catch (err) {
        const msg = `[gateway] start failure: ${String(err)}`;
        lastGatewayError = msg;
        const combined = [msg, lastGatewayOutput].filter(Boolean).join("\n");
        const reachable = await probeGateway().catch(() => false);
        if (!reachable && !isGatewayProcessConflict(combined)) {
          // Collect extra diagnostics to help users file issues.
          await runDoctorBestEffort();
        }
        throw err;
      }
    })().finally(() => {
      gatewayStarting = null;
    });
  }
  await gatewayStarting;
  return { ok: true };
}

async function restartGateway() {
  await stopGateway({ disableDesired: false });
  return ensureGatewayRunning();
}

function requireSetupAuth(req, res, next) {
  if (!SETUP_PASSWORD) {
    return res
      .status(500)
      .type("text/plain")
      .send("SETUP_PASSWORD is not set. Set it in Railway Variables before using /setup.");
  }

  const header = req.headers.authorization || "";
  const [scheme, encoded] = header.split(" ");
  if (scheme !== "Basic" || !encoded) {
    res.set("WWW-Authenticate", 'Basic realm="OpenClaw Setup"');
    return res.status(401).send("Auth required");
  }
  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  const idx = decoded.indexOf(":");
  const password = idx >= 0 ? decoded.slice(idx + 1) : "";
  if (password !== SETUP_PASSWORD) {
    res.set("WWW-Authenticate", 'Basic realm="OpenClaw Setup"');
    return res.status(401).send("Invalid password");
  }
  return next();
}

function requireInternalApiAuth(req, res, next) {
  if (!INTERNAL_SERVICE_TOKEN) {
    return res.status(503).json({
      ok: false,
      error: {
        code: "internal_auth_not_configured",
        message: "INTERNAL_SERVICE_TOKEN is not configured",
      },
    });
  }

  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token || token !== INTERNAL_SERVICE_TOKEN) {
    return res.status(401).json({
      ok: false,
      error: {
        code: "unauthorized",
        message: "Invalid internal service token",
      },
    });
  }

  return next();
}

function buildSkillInstruction(skill, context) {
  const skillPrompts = {
    explain: "Explain the selected section clearly and concisely.",
    socratic: "Ask 3-5 Socratic questions to test understanding of this section.",
    flashcards: "Generate concise flashcards from this section.",
    checklist: "Create a practical checklist from this section.",
    scenario_tree: "Build an if/then scenario tree from this section.",
    notes_assist: "Summarize this section into note-ready bullets.",
  };

  const selectedText = context?.selectedText ? `\nSelected text:\n${context.selectedText}` : "";
  const anchorId = context?.anchorId ? `\nAnchor: ${context.anchorId}` : "";
  const mode = context?.mode ? `\nMode: ${context.mode}` : "";

  return [
    skillPrompts[skill] || "Help with this section.",
    `\nSection slug: ${context?.sectionSlug || "unknown"}`,
    anchorId,
    mode,
    selectedText,
  ].join("");
}

function getLastNonEmptyLine(raw) {
  const lines = String(raw || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length > 0 ? lines[lines.length - 1] : "";
}

async function readOpenClawConfig(path) {
  const result = await runCmd(OPENCLAW_NODE, clawArgs(["config", "get", path]), {
    timeoutMs: 20_000,
  });
  if (result.code !== 0) {
    return {
      ok: false,
      value: null,
      raw: result.output,
    };
  }

  return {
    ok: true,
    value: getLastNonEmptyLine(result.output),
    raw: result.output,
  };
}

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "64kb" }));

// Minimal health endpoint for Railway.
app.get("/setup/healthz", (_req, res) => res.json({ ok: true }));

app.get("/claude-auth", (req, res) => {
  cleanupExpiredAdminClaudeFlows();

  const flowId = String(req.query?.flowId || "").trim();
  const completionToken = String(req.query?.completionToken || "").trim();
  const flow = resolvePendingAdminClaudeFlow({ flowId, completionToken });
  if (!flow) {
    return res.status(404).type("html").send(
      buildClaudeAuthMessagePage({
        ok: false,
        title: "Claude auth expired",
        message: "This Claude auth session was not found or has expired. Return to Admin and start it again.",
      }),
    );
  }

  return res.status(200).type("html").send(renderClaudeAuthPortalPage({ flow }));
});

app.post("/claude-auth", async (req, res) => {
  cleanupExpiredAdminClaudeFlows();

  const flowId = String(req.body?.flowId || "").trim();
  const completionToken = String(req.body?.completionToken || "").trim();
  const flow = resolvePendingAdminClaudeFlow({ flowId, completionToken });
  if (!flow) {
    return res.status(404).type("html").send(
      buildClaudeAuthMessagePage({
        ok: false,
        title: "Claude auth expired",
        message: "This Claude auth session was not found or has expired. Return to Admin and start it again.",
      }),
    );
  }

  const setupToken = String(req.body?.setupToken || "").trim();
  const tokenError = validateAnthropicSetupTokenInput(setupToken);
  if (tokenError) {
    return res.status(400).type("html").send(renderClaudeAuthPortalPage({ flow, error: tokenError, token: setupToken }));
  }

  try {
    const persisted = await persistAnthropicSetupToken(setupToken);
    await applyConfiguredSetupPayload(flow.payload || {});
    flow.completed = true;
    pendingAdminClaudeFlows.delete(flow.id);
    return res.status(200).type("html").send(
      buildClaudeAuthMessagePage({
        ok: true,
        title: "Claude auth completed",
        message: [
          `Saved Anthropic profile ${persisted.profileId}.`,
          "Return to the admin UI.",
        ].join(" "),
        openerOrigin: flow.openerOrigin,
      }),
    );
  } catch (error) {
    console.error("[/claude-auth] error:", error);
    return res.status(500).type("html").send(
      renderClaudeAuthPortalPage({
        flow,
        error: String(error),
        token: setupToken,
      }),
    );
  }
});

async function probeGateway() {
  // Don't assume HTTP — the gateway primarily speaks WebSocket.
  // A simple TCP connect check is enough for "is it up".
  const net = await import("node:net");

  return await new Promise((resolve) => {
    const sock = net.createConnection({
      host: INTERNAL_GATEWAY_HOST,
      port: INTERNAL_GATEWAY_PORT,
      timeout: 750,
    });

    const done = (ok) => {
      try { sock.destroy(); } catch {}
      resolve(ok);
    };

    sock.on("connect", () => done(true));
    sock.on("timeout", () => done(false));
    sock.on("error", () => done(false));
  });
}

// Public health endpoint (no auth) so Railway can probe without /setup.
// Keep this free of secrets.
app.get("/healthz", async (_req, res) => {
  let gatewayReachable = false;
  const claudeMaxProxy = await inspectClaudeMaxProxyStatus();
  if (isConfigured()) {
    try {
      gatewayReachable = await probeGateway();
      if (gatewayReachable && lastGatewayError?.includes("Gateway did not become ready in time")) {
        lastGatewayError = null;
      }
    } catch {
      gatewayReachable = false;
    }
  }

  const workspaceRealDir = resolveRealPathOrSelf(WORKSPACE_DIR);
  const memoryStats = collectWorkspaceMemoryStats();
  const memorySearch = resolveMemorySearchRuntime();

  res.json({
    ok: true,
    wrapper: {
      configured: isConfigured(),
      stateDir: STATE_DIR,
      workspaceDir: WORKSPACE_DIR,
      workspaceRealDir,
      workspaceVolumeDir: WORKSPACE_VOLUME_DIR,
      workspaceUnified: workspaceRealDir === resolveRealPathOrSelf(WORKSPACE_VOLUME_DIR),
      stateDirMode: safeMode(STATE_DIR),
      credentialsDirMode: safeMode(CREDENTIALS_DIR),
      memoryFiles: memoryStats.totalFiles,
      memorySearchProvider: memorySearch.provider,
      memorySearchSource: memorySearch.source,
      memorySearchStorePath: memorySearch.storePath,
      memorySearchWarnings: memorySearch.warnings,
    },
    gateway: {
      target: GATEWAY_TARGET,
      reachable: gatewayReachable,
      lastError: lastGatewayError,
      lastExit: lastGatewayExit,
      lastDoctorAt,
    },
    claudeMaxProxy: {
      configured: claudeMaxProxy.configured,
      baseUrl: claudeMaxProxy.baseUrl,
      reachable: claudeMaxProxy.reachable,
      running: claudeMaxProxy.running,
      cliStateDir: claudeMaxProxy.cliStateDir,
      lastError: claudeMaxProxy.lastError,
    },
  });
});

app.get("/internal/health", requireInternalApiAuth, async (_req, res) => {
  let gatewayReachable = false;
  const claudeMaxProxy = await inspectClaudeMaxProxyStatus();
  try {
    gatewayReachable = await probeGateway();
    if (gatewayReachable && lastGatewayError?.includes("Gateway did not become ready in time")) {
      lastGatewayError = null;
    }
  } catch {
    gatewayReachable = false;
  }

  const workspaceRealDir = resolveRealPathOrSelf(WORKSPACE_DIR);
  const memoryStats = collectWorkspaceMemoryStats();
  const memorySearch = resolveMemorySearchRuntime();

  return res.json({
    ok: true,
    components: {
      wrapper: {
        configured: isConfigured(),
        stateDir: STATE_DIR,
        workspaceDir: WORKSPACE_DIR,
        workspaceRealDir,
        workspaceUnified: workspaceRealDir === resolveRealPathOrSelf(WORKSPACE_VOLUME_DIR),
        stateDirMode: safeMode(STATE_DIR),
        credentialsDirMode: safeMode(CREDENTIALS_DIR),
      },
      gateway: {
        reachable: gatewayReachable,
        target: GATEWAY_TARGET,
      },
      qmd: {
        command: OPENCLAW_MEMORY_QMD_COMMAND,
        indexPath: QMD_INDEX_SQLITE_PATH,
        indexPresent: fs.existsSync(QMD_INDEX_SQLITE_PATH),
      },
      memory: {
        files: memoryStats.totalFiles,
        dailyFiles: memoryStats.dailyFiles,
        searchProvider: memorySearch.provider,
        searchSource: memorySearch.source,
        searchStorePath: memorySearch.storePath,
        searchModel: memorySearch.provider === "local" ? null : memorySearch.model || null,
        searchLocalModelPath:
          memorySearch.provider === "local" ? memorySearch.local?.modelPath || null : null,
        searchLocalModelCacheDir:
          memorySearch.provider === "local" ? memorySearch.local?.modelCacheDir || null : null,
        warnings: memorySearch.warnings,
      },
      httpApi: {
        chatCompletions: "/v1/chat/completions",
        responses: "/v1/responses",
        toolsInvoke: "/tools/invoke",
      },
      claudeMaxProxy: {
        providerId: claudeMaxProxy.providerId,
        configured: claudeMaxProxy.configured,
        defaultModel: claudeMaxProxy.defaultModel,
        baseUrl: claudeMaxProxy.baseUrl,
        reachable: claudeMaxProxy.reachable,
        running: claudeMaxProxy.running,
        cliStateDir: claudeMaxProxy.cliStateDir,
        lastError: claudeMaxProxy.lastError,
      },
    },
  });
});

app.get("/internal/web/auth/onboarding-state", requireInternalApiAuth, async (_req, res) => {
  const userCount = countWebAuthUsers();
  return res.json({
    ok: true,
    onboardingOpen: userCount === 0,
    userCount,
  });
});

app.post("/internal/web/auth/register", requireInternalApiAuth, async (req, res) => {
  const body = req.body || {};
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!name || !email || !password) {
    return res.status(400).json({
      ok: false,
      error: {
        code: "invalid_request",
        message: "name, email, and password are required",
      },
    });
  }

  if (password.length < 8) {
    return res.status(400).json({
      ok: false,
      error: {
        code: "invalid_password",
        message: "Password must be at least 8 characters",
      },
    });
  }

  const result = registerInitialWebAdmin({ name, email, password });
  if (!result.ok) {
    const statusCode = result.code === "onboarding_closed" ? 403 : 400;
    return res.status(statusCode).json({
      ok: false,
      error: {
        code: result.code,
        message: result.message,
      },
    });
  }

  return res.json({
    ok: true,
    user: {
      id: result.user.id,
      name: result.user.name,
      email: result.user.email,
    },
    role: result.user.role,
  });
});

app.post("/internal/web/auth/verify", requireInternalApiAuth, async (req, res) => {
  const body = req.body || {};
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    return res.status(400).json({
      ok: false,
      error: {
        code: "invalid_request",
        message: "email and password are required",
      },
    });
  }

  const result = verifyWebAuthCredentials({ email, password });
  if (!result.ok || !result.user) {
    return res.status(401).json({
      ok: false,
      error: {
        code: "invalid_credentials",
        message: "Invalid email or password",
      },
    });
  }

  return res.json({
    ok: true,
    user: result.user,
  });
});

app.get("/internal/web/auth/me", requireInternalApiAuth, async (req, res) => {
  const context = getInternalUserContext(req, res);
  if (!context) return;

  const user = findWebAuthUserById(context.userId);
  if (!user) {
    return res.status(401).json({
      ok: false,
      error: {
        code: "unauthorized",
        message: "User not found",
      },
    });
  }

  return res.json({
    ok: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role === "admin" ? "admin" : "user",
      prefs: null,
    },
  });
});

app.post("/internal/web/rate-limit/increment", requireInternalApiAuth, async (req, res) => {
  const body = req.body || {};
  const key = typeof body.key === "string" ? body.key : "";
  const windowStart = Number.parseInt(String(body.windowStart ?? ""), 10);

  if (!key || !Number.isFinite(windowStart)) {
    return res.status(400).json({
      ok: false,
      error: {
        code: "invalid_request",
        message: "key and windowStart are required",
      },
    });
  }

  const count = incrementWebRateLimit(key, windowStart);
  return res.json({ ok: true, count });
});

app.post("/internal/web/audit-log", requireInternalApiAuth, async (req, res) => {
  const body = req.body || {};
  const action = typeof body.action === "string" ? body.action : "";
  const actorUserId = typeof body.actorUserId === "string" ? body.actorUserId : null;
  const details = body.details && typeof body.details === "object" ? body.details : {};

  if (!action) {
    return res.status(400).json({
      ok: false,
      error: {
        code: "invalid_request",
        message: "action is required",
      },
    });
  }

  appendWebAuditEvent({
    id: crypto.randomUUID(),
    actor_user_id: actorUserId,
    action,
    details: JSON.stringify(details),
    created_at: new Date().toISOString(),
  });

  return res.json({ ok: true });
});

app.get("/internal/web/audit-log/last", requireInternalApiAuth, async (req, res) => {
  const action = typeof req.query.action === "string" ? req.query.action.trim() : "";
  if (!action) {
    return res.status(400).json({
      ok: false,
      error: {
        code: "invalid_request",
        message: "action query parameter is required",
      },
    });
  }

  const row = findLastWebAuditByAction(action);
  return res.json({ ok: true, row });
});

app.get("/internal/web/data/status", requireInternalApiAuth, async (_req, res) => {
  return res.json({
    ok: true,
    stores: {
      auth: fs.existsSync(WEB_AUTH_STORE_PATH) ? "present" : "missing",
      notes: fs.existsSync(WEB_NOTES_STORE_PATH) ? "present" : "missing",
      highlights: fs.existsSync(WEB_HIGHLIGHTS_STORE_PATH) ? "present" : "missing",
      bookmarks: fs.existsSync(WEB_BOOKMARKS_STORE_PATH) ? "present" : "missing",
      progress: fs.existsSync(WEB_PROGRESS_STORE_PATH) ? "present" : "missing",
      playbooks: fs.existsSync(WEB_PLAYBOOKS_STORE_PATH) ? "present" : "missing",
      rateLimits: fs.existsSync(WEB_RATE_LIMITS_STORE_PATH) ? "present" : "missing",
      auditLog: fs.existsSync(WEB_AUDIT_LOG_STORE_PATH) ? "present" : "missing",
      bookSections: fs.existsSync(WEB_BOOK_SECTIONS_STORE_PATH) ? "present" : "missing",
      bookToc: fs.existsSync(WEB_BOOK_TOC_STORE_PATH) ? "present" : "missing",
    },
  });
});

app.get("/internal/web/book/toc", requireInternalApiAuth, async (_req, res) => {
  const toc = readWebBookToc();
  return res.json({
    ok: true,
    tocTree: toc.tree ?? {},
    updatedAt: toc.updated_at ?? null,
  });
});

app.get("/internal/web/book/section", requireInternalApiAuth, async (req, res) => {
  const slug = typeof req.query.slug === "string" ? req.query.slug.trim() : "";
  if (!slug) {
    return res.status(400).json({
      ok: false,
      error: {
        code: "invalid_request",
        message: "slug is required",
      },
    });
  }

  const ordered = getPublishedSectionsOrdered();
  const section = ordered.find((item) => item.slug === slug) || null;
  if (!section) {
    return res.status(404).json({
      ok: false,
      error: {
        code: "not_found",
        message: "Section not found",
      },
    });
  }

  const slugs = ordered.map((item) => item.slug);
  const index = slugs.findIndex((entry) => entry === section.slug);
  const previousSlug = index > 0 ? slugs[index - 1] : null;
  const nextSlug = index >= 0 && index < slugs.length - 1 ? slugs[index + 1] : null;

  return res.json({
    ok: true,
    section,
    previousSlug,
    nextSlug,
  });
});

app.get("/internal/web/book/search", requireInternalApiAuth, async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";
  if (!q) {
    return res.status(400).json({
      ok: false,
      error: {
        code: "invalid_request",
        message: "q is required",
      },
    });
  }

  const docs = getPublishedSectionsOrdered();
  const results = docs
    .filter((item) => {
      const haystack = `${item.slug || ""}\n${item.section_title || ""}\n${item.body_markdown || ""}`.toLowerCase();
      return haystack.includes(q);
    })
    .slice(0, 20)
    .map((item) => {
      const snippet = String(item.body_markdown || "").slice(0, 240);
      const headings = (() => {
        try {
          return item.headings ? JSON.parse(item.headings) : [];
        } catch {
          return [];
        }
      })();

      return {
        sectionSlug: item.slug,
        anchorId: headings[0]?.id || "",
        score: 1,
        snippet,
      };
    });

  return res.json({
    ok: true,
    q,
    results,
  });
});

app.get("/internal/web/notes", requireInternalApiAuth, async (req, res) => {
  const context = getInternalUserContext(req, res);
  if (!context) return;

  const sectionSlug =
    typeof req.query.sectionSlug === "string" ? req.query.sectionSlug.trim() : "";
  const rows = readWebNotes()
    .filter((note) => note.user_id === context.userId)
    .filter((note) => (!sectionSlug ? true : note.section_slug === sectionSlug))
    .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")))
    .map(normalizeNoteRecord);

  return res.json({
    ok: true,
    notes: rows,
  });
});

app.post("/internal/web/notes", requireInternalApiAuth, async (req, res) => {
  const context = getInternalUserContext(req, res);
  if (!context) return;

  const body = req.body || {};
  const sectionSlug = typeof body.sectionSlug === "string" ? body.sectionSlug.trim() : "";
  const noteText = typeof body.noteText === "string" ? body.noteText : "";
  const anchorId = typeof body.anchorId === "string" ? body.anchorId : null;
  const title = typeof body.title === "string" ? body.title : null;
  const selection = body.selection && typeof body.selection === "object" ? body.selection : null;
  const tags = Array.isArray(body.tags)
    ? body.tags.map((tag) => String(tag)).filter(Boolean)
    : [];

  if (!sectionSlug || !noteText) {
    return res.status(400).json({
      ok: false,
      error: {
        code: "invalid_request",
        message: "sectionSlug and noteText are required",
      },
    });
  }

  const ts = new Date().toISOString();
  const next = {
    id: crypto.randomUUID(),
    user_id: context.userId,
    section_slug: sectionSlug,
    anchor_id: anchorId,
    selection: selection ? JSON.stringify(selection) : null,
    title,
    body: noteText,
    tags: JSON.stringify(tags),
    created_at: ts,
    updated_at: ts,
  };

  const notes = readWebNotes();
  notes.push(next);
  writeWebNotes(notes);

  return res.json({
    ok: true,
    note: normalizeNoteRecord(next),
  });
});

app.patch("/internal/web/notes/:id", requireInternalApiAuth, async (req, res) => {
  const context = getInternalUserContext(req, res);
  if (!context) return;

  const noteId = String(req.params.id || "").trim();
  if (!noteId) {
    return res.status(400).json({
      ok: false,
      error: {
        code: "invalid_request",
        message: "Invalid note id",
      },
    });
  }

  const body = req.body || {};
  const notes = readWebNotes();
  const index = notes.findIndex(
    (note) => note.id === noteId && note.user_id === context.userId,
  );
  if (index < 0) {
    return res.status(404).json({
      ok: false,
      error: {
        code: "not_found",
        message: "Note not found",
      },
    });
  }

  const current = notes[index];
  const updated = {
    ...current,
    updated_at: new Date().toISOString(),
  };
  if (typeof body.noteText === "string") updated.body = body.noteText;
  if (Array.isArray(body.tags)) {
    updated.tags = JSON.stringify(
      body.tags.map((tag) => String(tag)).filter(Boolean),
    );
  }
  if (typeof body.title === "string") updated.title = body.title;

  notes[index] = updated;
  writeWebNotes(notes);

  return res.json({
    ok: true,
    note: normalizeNoteRecord(updated),
  });
});

app.delete("/internal/web/notes/:id", requireInternalApiAuth, async (req, res) => {
  const context = getInternalUserContext(req, res);
  if (!context) return;

  const noteId = String(req.params.id || "").trim();
  if (!noteId) {
    return res.status(400).json({
      ok: false,
      error: {
        code: "invalid_request",
        message: "Invalid note id",
      },
    });
  }

  const notes = readWebNotes();
  const next = notes.filter(
    (note) => !(note.id === noteId && note.user_id === context.userId),
  );
  if (next.length === notes.length) {
    return res.status(404).json({
      ok: false,
      error: {
        code: "not_found",
        message: "Note not found",
      },
    });
  }

  writeWebNotes(next);
  return res.json({ ok: true });
});

app.post("/internal/web/highlights", requireInternalApiAuth, async (req, res) => {
  const context = getInternalUserContext(req, res);
  if (!context) return;

  const body = req.body || {};
  const sectionSlug = typeof body.sectionSlug === "string" ? body.sectionSlug.trim() : "";
  const text = typeof body.text === "string" ? body.text : "";
  const anchorId = typeof body.anchorId === "string" ? body.anchorId : null;
  const color = typeof body.color === "string" ? body.color : "yellow";
  const noteId = typeof body.noteId === "string" ? body.noteId : null;
  const range = body.range && typeof body.range === "object" ? body.range : null;
  const startOffset = Number.parseInt(String(range?.startOffset ?? ""), 10);
  const endOffset = Number.parseInt(String(range?.endOffset ?? ""), 10);

  if (!sectionSlug || !text || !Number.isFinite(startOffset) || !Number.isFinite(endOffset)) {
    return res.status(400).json({
      ok: false,
      error: {
        code: "invalid_request",
        message: "sectionSlug, text, and range are required",
      },
    });
  }

  const created = {
    id: crypto.randomUUID(),
    user_id: context.userId,
    section_slug: sectionSlug,
    anchor_id: anchorId,
    range_start: startOffset,
    range_end: endOffset,
    text,
    color,
    note_id: noteId,
    created_at: new Date().toISOString(),
  };

  const highlights = readWebHighlights();
  highlights.push(created);
  writeWebHighlights(highlights);

  return res.json({
    ok: true,
    highlight: normalizeHighlightRecord(created),
  });
});

app.post("/internal/web/bookmarks/toggle", requireInternalApiAuth, async (req, res) => {
  const context = getInternalUserContext(req, res);
  if (!context) return;

  const body = req.body || {};
  const sectionSlug = typeof body.sectionSlug === "string" ? body.sectionSlug.trim() : "";
  const anchorId = typeof body.anchorId === "string" ? body.anchorId : null;

  if (!sectionSlug) {
    return res.status(400).json({
      ok: false,
      error: {
        code: "invalid_request",
        message: "sectionSlug is required",
      },
    });
  }

  const bookmarks = readWebBookmarks();
  const existingIndex = bookmarks.findIndex(
    (bookmark) =>
      bookmark.user_id === context.userId &&
      bookmark.section_slug === sectionSlug &&
      (bookmark.anchor_id ?? null) === (anchorId ?? null),
  );

  if (existingIndex >= 0) {
    bookmarks.splice(existingIndex, 1);
    writeWebBookmarks(bookmarks);
    return res.json({ ok: true, bookmarked: false });
  }

  bookmarks.push({
    id: crypto.randomUUID(),
    user_id: context.userId,
    section_slug: sectionSlug,
    anchor_id: anchorId,
    created_at: new Date().toISOString(),
  });
  writeWebBookmarks(bookmarks);

  return res.json({ ok: true, bookmarked: true });
});

app.post("/internal/web/progress", requireInternalApiAuth, async (req, res) => {
  const context = getInternalUserContext(req, res);
  if (!context) return;

  const body = req.body || {};
  const sectionSlug = typeof body.sectionSlug === "string" ? body.sectionSlug.trim() : "";
  const percentRaw = Number(body.percent);
  const percent = Number.isFinite(percentRaw)
    ? Math.max(0, Math.min(100, percentRaw))
    : Number.NaN;
  const lastAnchorId = typeof body.lastAnchorId === "string" ? body.lastAnchorId : null;

  if (!sectionSlug || !Number.isFinite(percent)) {
    return res.status(400).json({
      ok: false,
      error: {
        code: "invalid_request",
        message: "sectionSlug and percent are required",
      },
    });
  }

  const items = readWebProgress();
  const idx = items.findIndex(
    (item) => item.user_id === context.userId && item.section_slug === sectionSlug,
  );
  const ts = new Date().toISOString();
  let record;

  if (idx >= 0) {
    const next = {
      ...items[idx],
      percent,
      last_anchor_id: lastAnchorId,
      updated_at: ts,
    };
    items[idx] = next;
    record = next;
  } else {
    const created = {
      id: crypto.randomUUID(),
      user_id: context.userId,
      section_slug: sectionSlug,
      percent,
      last_anchor_id: lastAnchorId,
      updated_at: ts,
    };
    items.push(created);
    record = created;
  }

  writeWebProgress(items);
  return res.json({
    ok: true,
    progress: normalizeProgressRecord(record),
  });
});

app.get("/internal/web/progress/summary", requireInternalApiAuth, async (req, res) => {
  const context = getInternalUserContext(req, res);
  if (!context) return;

  const rows = readWebProgress()
    .filter((item) => item.user_id === context.userId)
    .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")))
    .slice(0, 10)
    .map(normalizeProgressRecord);

  return res.json({
    ok: true,
    continue: rows[0] ?? null,
    recent: rows,
  });
});

app.get("/internal/web/playbooks", requireInternalApiAuth, async (req, res) => {
  const context = getInternalUserContext(req, res);
  if (!context) return;

  const rows = readWebPlaybooks()
    .filter((item) => {
      if (context.role === "admin") return true;
      return item.status === "published" || (item.status === "draft" && item.created_by === context.userId);
    })
    .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")))
    .map(normalizePlaybookRecord);

  return res.json({
    ok: true,
    playbooks: rows,
  });
});

app.post("/internal/web/playbooks/draft", requireInternalApiAuth, async (req, res) => {
  const context = getInternalUserContext(req, res);
  if (!context) return;

  const body = req.body || {};
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    return res.status(400).json({
      ok: false,
      error: {
        code: "invalid_request",
        message: "title is required",
      },
    });
  }

  const ts = new Date().toISOString();
  const row = {
    id: crypto.randomUUID(),
    status: "draft",
    title,
    triggers: JSON.stringify(Array.isArray(body.triggers) ? body.triggers.map((v) => String(v)) : []),
    checklist: JSON.stringify(Array.isArray(body.checklist) ? body.checklist.map((v) => String(v)) : []),
    scenario_tree: typeof body.scenarioTree === "string" ? body.scenarioTree : "",
    linked_sections: JSON.stringify(
      Array.isArray(body.linkedSections) ? body.linkedSections.map((v) => String(v)) : [],
    ),
    tags: JSON.stringify(Array.isArray(body.tags) ? body.tags.map((v) => String(v)) : []),
    created_by: context.userId,
    created_at: ts,
    updated_at: ts,
    published_at: null,
  };

  const rows = readWebPlaybooks();
  rows.push(row);
  writeWebPlaybooks(rows);

  return res.json({
    ok: true,
    playbook: normalizePlaybookRecord(row),
  });
});

app.patch("/internal/web/playbooks/:id", requireInternalApiAuth, async (req, res) => {
  const context = getInternalUserContext(req, res);
  if (!context) return;

  const playbookId = String(req.params.id || "").trim();
  if (!playbookId) {
    return res.status(400).json({
      ok: false,
      error: {
        code: "invalid_request",
        message: "Invalid playbook id",
      },
    });
  }

  const rows = readWebPlaybooks();
  const idx = rows.findIndex((item) => item.id === playbookId);
  if (idx < 0) {
    return res.status(404).json({
      ok: false,
      error: {
        code: "not_found",
        message: "Playbook not found",
      },
    });
  }

  const current = rows[idx];
  const ownerMatch = current.created_by === context.userId;
  if (!ownerMatch && context.role !== "admin") {
    return res.status(403).json({
      ok: false,
      error: {
        code: "forbidden",
        message: "Not allowed to edit this playbook",
      },
    });
  }

  const body = req.body || {};
  const updated = {
    ...current,
    updated_at: new Date().toISOString(),
  };

  if (typeof body.title === "string") updated.title = body.title;
  if (Array.isArray(body.triggers)) updated.triggers = JSON.stringify(body.triggers.map((v) => String(v)));
  if (Array.isArray(body.checklist)) updated.checklist = JSON.stringify(body.checklist.map((v) => String(v)));
  if (typeof body.scenarioTree === "string") updated.scenario_tree = body.scenarioTree;
  if (Array.isArray(body.linkedSections)) {
    updated.linked_sections = JSON.stringify(body.linkedSections.map((v) => String(v)));
  }
  if (Array.isArray(body.tags)) updated.tags = JSON.stringify(body.tags.map((v) => String(v)));

  rows[idx] = updated;
  writeWebPlaybooks(rows);

  return res.json({
    ok: true,
    playbook: normalizePlaybookRecord(updated),
  });
});

app.post("/internal/web/playbooks/:id/publish", requireInternalApiAuth, async (req, res) => {
  const context = getInternalUserContext(req, res);
  if (!context) return;

  if (context.role !== "admin") {
    return res.status(403).json({
      ok: false,
      error: {
        code: "forbidden",
        message: "Admin role required",
      },
    });
  }

  const playbookId = String(req.params.id || "").trim();
  if (!playbookId) {
    return res.status(400).json({
      ok: false,
      error: {
        code: "invalid_request",
        message: "Invalid playbook id",
      },
    });
  }

  const rows = readWebPlaybooks();
  const idx = rows.findIndex((item) => item.id === playbookId);
  if (idx < 0) {
    return res.status(404).json({
      ok: false,
      error: {
        code: "not_found",
        message: "Playbook not found",
      },
    });
  }

  const ts = new Date().toISOString();
  const updated = {
    ...rows[idx],
    status: "published",
    published_at: ts,
    updated_at: ts,
  };
  rows[idx] = updated;
  writeWebPlaybooks(rows);

  return res.json({
    ok: true,
    playbook: normalizePlaybookRecord(updated),
  });
});

app.post("/internal/web/playbooks/:id/archive", requireInternalApiAuth, async (req, res) => {
  const context = getInternalUserContext(req, res);
  if (!context) return;

  if (context.role !== "admin") {
    return res.status(403).json({
      ok: false,
      error: {
        code: "forbidden",
        message: "Admin role required",
      },
    });
  }

  const playbookId = String(req.params.id || "").trim();
  if (!playbookId) {
    return res.status(400).json({
      ok: false,
      error: {
        code: "invalid_request",
        message: "Invalid playbook id",
      },
    });
  }

  const rows = readWebPlaybooks();
  const idx = rows.findIndex((item) => item.id === playbookId);
  if (idx < 0) {
    return res.status(404).json({
      ok: false,
      error: {
        code: "not_found",
        message: "Playbook not found",
      },
    });
  }

  const updated = {
    ...rows[idx],
    status: "archived",
    updated_at: new Date().toISOString(),
  };
  rows[idx] = updated;
  writeWebPlaybooks(rows);

  return res.json({
    ok: true,
    playbook: normalizePlaybookRecord(updated),
  });
});

app.post("/internal/agent/run", requireInternalApiAuth, async (req, res) => {
  const payload = req.body || {};
  const skill = typeof payload.skill === "string" ? payload.skill : "";
  const context = payload.context && typeof payload.context === "object" ? payload.context : {};

  if (!skill) {
    return res.status(400).json({
      ok: false,
      error: {
        code: "invalid_request",
        message: "skill is required",
      },
    });
  }

  try {
    await ensureGatewayRunning();

    const userMessage = buildSkillInstruction(skill, context);

    const responsesResult = await fetch(`${GATEWAY_TARGET}/v1/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENCLAW_GATEWAY_TOKEN}`,
        "x-openclaw-agent-id": "main",
      },
      body: JSON.stringify({
        model: "openclaw:main",
        input: userMessage,
      }),
    });

    if (responsesResult.ok) {
      const data = await responsesResult.json();
      return res.json({
        ok: true,
        skill,
        output: data,
        source: "gateway.responses",
      });
    }

    const chatResult = await fetch(`${GATEWAY_TARGET}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENCLAW_GATEWAY_TOKEN}`,
        "x-openclaw-agent-id": "main",
      },
      body: JSON.stringify({
        model: "openclaw:main",
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!chatResult.ok) {
      const body = await chatResult.text();
      return res.status(503).json({
        ok: false,
        error: {
          code: "gateway_unavailable",
          message: "Gateway HTTP APIs are not available",
          details: body,
        },
      });
    }

    const chatData = await chatResult.json();
    return res.json({
      ok: true,
      skill,
      output: chatData,
      source: "gateway.chat_completions",
    });
  } catch (error) {
    return res.status(503).json({
      ok: false,
      error: {
        code: "core_unavailable",
        message: String(error),
      },
    });
  }
});

app.post("/internal/index/rebuild", requireInternalApiAuth, async (_req, res) => {
  try {
    await restartGateway();
    return res.json({
      started: true,
      jobId: `gateway-restart-${Date.now()}`,
      mode: "gateway_restart",
    });
  } catch (error) {
    return res.status(503).json({
      started: false,
      error: {
        code: "reindex_failed",
        message: String(error),
      },
    });
  }
});

app.get("/internal/openclaw/settings", requireInternalApiAuth, async (_req, res) => {
  try {
    const paths = {
      authMode: "gateway.auth.mode",
      bind: "gateway.bind",
      port: "gateway.port",
      authToken: "gateway.auth.token",
      remoteToken: "gateway.remote.token",
      chatCompletionsEnabled: "gateway.http.endpoints.chatCompletions.enabled",
      responsesEnabled: "gateway.http.endpoints.responses.enabled",
      telegramChannel: "channels.telegram",
      discordChannel: "channels.discord",
      slackChannel: "channels.slack",
    };

    const entries = await Promise.all(
      Object.entries(paths).map(async ([key, path]) => {
        const result = await readOpenClawConfig(path);
        return [key, result];
      }),
    );

    const map = Object.fromEntries(entries);

    return res.json({
      ok: true,
      configured: isConfigured(),
      setupPasswordConfigured: Boolean(SETUP_PASSWORD),
      gatewayTarget: GATEWAY_TARGET,
      settings: {
        authMode: map.authMode?.value ?? null,
        bind: map.bind?.value ?? null,
        port: map.port?.value ?? null,
        chatCompletionsEnabled: map.chatCompletionsEnabled?.value ?? null,
        responsesEnabled: map.responsesEnabled?.value ?? null,
      },
      secrets: {
        authTokenConfigured: Boolean(map.authToken?.value),
        remoteTokenConfigured: Boolean(map.remoteToken?.value),
      },
      channels: {
        telegram: map.telegramChannel?.value ?? null,
        discord: map.discordChannel?.value ?? null,
        slack: map.slackChannel?.value ?? null,
      },
    });
  } catch (error) {
    return res.status(503).json({
      ok: false,
      error: {
        code: "settings_unavailable",
        message: String(error),
      },
    });
  }
});

app.post("/internal/openclaw/gateway/restart", requireInternalApiAuth, async (_req, res) => {
  try {
    await restartGateway();
    return res.json({
      ok: true,
      restarted: true,
      at: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(503).json({
      ok: false,
      error: {
        code: "gateway_restart_failed",
        message: String(error),
      },
    });
  }
});

app.post("/internal/openclaw/console/run", requireInternalApiAuth, async (req, res) => {
  const payload = req.body || {};
  const cmd = String(payload.cmd || "").trim();
  const arg = String(payload.arg || "").trim();

  // Use the same full allowlist as /setup/api/console/run
  const allowed = new Set([
    "gateway.restart",
    "gateway.stop",
    "gateway.start",
    "openclaw.version",
    "openclaw.status",
    "openclaw.health",
    "openclaw.doctor",
    "openclaw.logs.tail",
    "openclaw.config.get",
    "openclaw.models.list",
    "openclaw.models.set",
    "openclaw.devices.list",
    "openclaw.devices.approve",
    "openclaw.plugins.list",
    "openclaw.plugins.enable",
  ]);

  if (!allowed.has(cmd)) {
    return res.status(400).json({
      ok: false,
      error: { code: "invalid_command", message: "Command not allowed" },
    });
  }

  try {
    if (cmd === "gateway.restart") {
      await restartGateway();
      return res.json({ ok: true, output: "Gateway restarted (wrapper-managed).\n" });
    }
    if (cmd === "gateway.stop") {
      await stopGateway();
      return res.json({ ok: true, output: "Gateway stopped (wrapper-managed).\n" });
    }
    if (cmd === "gateway.start") {
      const r = await ensureGatewayRunning();
      return res.json({ ok: Boolean(r.ok), output: r.ok ? "Gateway started.\n" : `Gateway not started: ${r.reason}\n` });
    }
    if (cmd === "openclaw.version") {
      const r = await runCmd(OPENCLAW_NODE, clawArgs(["--version"]));
      return res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, output: redactSecrets(r.output) });
    }
    if (cmd === "openclaw.status") {
      const r = await runCmd(OPENCLAW_NODE, clawArgs(["status"]));
      return res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, output: redactSecrets(r.output) });
    }
    if (cmd === "openclaw.health") {
      const r = await runCmd(OPENCLAW_NODE, clawArgs(["health"]));
      return res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, output: redactSecrets(r.output) });
    }
    if (cmd === "openclaw.doctor") {
      const r = await runCmd(OPENCLAW_NODE, clawArgs(["doctor"]));
      return res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, output: redactSecrets(r.output) });
    }
    if (cmd === "openclaw.logs.tail") {
      const lines = Math.max(50, Math.min(1000, Number.parseInt(arg || "200", 10) || 200));
      const r = await runCmd(OPENCLAW_NODE, clawArgs(["logs", "--tail", String(lines)]));
      return res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, output: redactSecrets(r.output) });
    }
    if (cmd === "openclaw.config.get") {
      if (!arg) {
        return res.status(400).json({ ok: false, error: { code: "missing_argument", message: "Config path is required" } });
      }
      const r = await runCmd(OPENCLAW_NODE, clawArgs(["config", "get", arg]));
      return res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, output: redactSecrets(r.output) });
    }
    if (cmd === "openclaw.models.list") {
      const r = await runCmd(OPENCLAW_NODE, clawArgs(["models", "list", "--all"]));
      return res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, output: redactSecrets(r.output) });
    }
    if (cmd === "openclaw.models.set") {
      const model = String(arg || "").trim();
      if (!model) {
        return res.status(400).json({ ok: false, error: { code: "missing_argument", message: "Model id is required (provider/model-id)" } });
      }
      const r = await runCmd(OPENCLAW_NODE, clawArgs(["models", "set", model]));
      return res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, output: redactSecrets(r.output) });
    }
    if (cmd === "openclaw.devices.list") {
      const r = await runCmd(OPENCLAW_NODE, clawArgs(["devices", "list"]));
      return res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, output: redactSecrets(r.output) });
    }
    if (cmd === "openclaw.devices.approve") {
      const requestId = String(arg || "").trim();
      if (!requestId) return res.status(400).json({ ok: false, error: { code: "missing_argument", message: "Missing device request ID" } });
      if (!/^[A-Za-z0-9_-]+$/.test(requestId)) return res.status(400).json({ ok: false, error: { code: "invalid_argument", message: "Invalid device request ID" } });
      const r = await runCmd(OPENCLAW_NODE, clawArgs(["devices", "approve", requestId]));
      return res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, output: redactSecrets(r.output) });
    }
    if (cmd === "openclaw.plugins.list") {
      const r = await runCmd(OPENCLAW_NODE, clawArgs(["plugins", "list"]));
      return res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, output: redactSecrets(r.output) });
    }
    if (cmd === "openclaw.plugins.enable") {
      const name = String(arg || "").trim();
      if (!name) return res.status(400).json({ ok: false, error: { code: "missing_argument", message: "Missing plugin name" } });
      if (!/^[A-Za-z0-9_-]+$/.test(name)) return res.status(400).json({ ok: false, error: { code: "invalid_argument", message: "Invalid plugin name" } });
      const r = await runCmd(OPENCLAW_NODE, clawArgs(["plugins", "enable", name]));
      return res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, output: redactSecrets(r.output) });
    }

    return res.status(400).json({ ok: false, error: { code: "invalid_command", message: "Unhandled command" } });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: { code: "console_failed", message: String(error) },
    });
  }
});

// --- Internal bridge endpoints for /setup/api/* (used by the web Admin page) ---
// These mirror the existing /setup/api/* endpoints but use INTERNAL_SERVICE_TOKEN auth
// instead of SETUP_PASSWORD Basic auth, so the web service can call them via coreFetch().

app.get("/internal/openclaw/setup/status", requireInternalApiAuth, async (_req, res) => {
  try {
    const version = await runCmd(OPENCLAW_NODE, clawArgs(["--version"]));
    const channelsHelp = await runCmd(OPENCLAW_NODE, clawArgs(["channels", "add", "--help"]));
    const claudeMaxProxy = await inspectClaudeMaxProxyStatus();

    res.json({
      ok: true,
      configured: isConfigured(),
      gatewayTarget: GATEWAY_TARGET,
      openclawVersion: version.output.trim(),
      channelsAddHelp: channelsHelp.output,
      authGroups: AUTH_GROUPS,
      claudeMaxProxy,
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: { code: "status_failed", message: String(error) } });
  }
});

app.get("/internal/openclaw/setup/auth-groups", requireInternalApiAuth, (_req, res) => {
  res.json({ ok: true, authGroups: AUTH_GROUPS });
});

app.post("/internal/openclaw/setup/run", requireInternalApiAuth, async (req, res) => {
  try {
    const respondJson = (status, body) => {
      if (res.writableEnded || res.headersSent) return;
      res.status(status).json(body);
    };
    if (isConfigured()) {
      await ensureGatewayRunning();
      return respondJson(200, {
        ok: true,
        output: "Already configured.\nUse Reset setup if you want to rerun onboarding.\n",
      });
    }

    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.mkdirSync(WORKSPACE_DIR, { recursive: true });

    const payload = normalizeSetupPayload(req.body || {});
    const authChoice = await resolveAuthChoiceCompatibility(payload.authChoice);
    if (authChoice === "openai-codex" || authChoice === "claude-cli") {
      const label =
        authChoice === "openai-codex"
          ? "OpenAI Codex OAuth"
          : "Claude Code setup-token";
      return respondJson(400, {
        ok: false,
        output: [
          `Setup input error: ${label} is only supported from the web admin UI.`,
          "Open this URL and continue there:",
          "https://openclaw-web-reality-check.up.railway.app/admin",
        ].join("\n"),
      });
    }

    let onboardArgs;
    try {
      onboardArgs = await buildOnboardArgs(payload);
    } catch (err) {
      return respondJson(400, { ok: false, output: `Setup input error: ${String(err)}` });
    }

    const prefix = "[setup] running openclaw onboard...\n";
    const onboard = await runCmd(OPENCLAW_NODE, clawArgs(onboardArgs));

    let extra = "";
    const ok = onboard.code === 0 && isConfigured();

    if (ok) {
      extra = await applyConfiguredSetupPayload(payload);
    }

    return respondJson(ok ? 200 : 500, {
      ok,
      output: `${prefix}${onboard.output}${extra}`,
    });
  } catch (err) {
    console.error("[/internal/openclaw/setup/run] error:", err);
    if (!res.headersSent) res.status(500).json({ ok: false, output: `Internal error: ${String(err)}` });
  }
});

app.post("/internal/openclaw/setup/oauth/start", requireInternalApiAuth, async (req, res) => {
  cleanupExpiredAdminOauthFlows();

  try {
    const payload = req.body || {};
    const authChoice = await resolveAuthChoiceCompatibility(payload.authChoice);
    if (authChoice !== "openai-codex") {
      return res.status(400).json({
        ok: false,
        error: { code: "invalid_auth_choice", message: "OAuth start only supports authChoice=openai-codex" },
      });
    }

    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.mkdirSync(WORKSPACE_DIR, { recursive: true });

    const flowId = crypto.randomUUID();
    const completionToken = crypto.randomBytes(32).toString("hex");
    const redirectUri = String(payload.hostedRedirectUri || payload.redirectUri || OPENAI_CODEX_REDIRECT_URI).trim();
    if (!/^https?:\/\//i.test(redirectUri)) {
      return res.status(400).json({
        ok: false,
        error: { code: "invalid_redirect_uri", message: "redirectUri must be an http(s) URL" },
      });
    }

    const codeVerifier = createOpenAICodexPkceVerifier();
    const oauthState = crypto.randomBytes(16).toString("hex");
    const authUrl = buildOpenAICodexAuthorizationUrl({
      codeVerifier,
      redirectUri,
      state: oauthState,
    });
    const hostedFlow = redirectUri !== OPENAI_CODEX_REDIRECT_URI;
    const flow = {
      id: flowId,
      completionToken,
      createdAt: Date.now(),
      payload,
      authUrl,
      instructions: hostedFlow
        ? "Complete sign-in in the popup. OpenClaw will finish onboarding when the browser returns to Railway."
        : "Open this URL in your local browser, sign in, then paste the full redirect URL back into Admin.",
      completed: false,
      codeVerifier,
      oauthState,
      redirectUri,
    };

    pendingAdminOauthFlows.set(flowId, flow);

    return res.json({
      ok: true,
      flowId,
      completionToken,
      authUrl: flow.authUrl,
      instructions: flow.instructions,
      expiresAt: new Date(flow.createdAt + ADMIN_OAUTH_FLOW_TIMEOUT_MS).toISOString(),
      output:
        hostedFlow
          ? "[oauth] Open the authorization URL, complete sign-in, and OpenClaw will finish when the browser returns to Railway.\n"
          : "[oauth] Open the authorization URL in your local browser, complete sign-in, then paste the full redirect URL into Admin.\n",
    });
  } catch (err) {
    console.error("[/internal/openclaw/setup/oauth/start] error:", err);
    return res.status(500).json({
      ok: false,
      error: { code: "oauth_start_failed", message: String(err) },
    });
  }
});

app.post("/internal/openclaw/setup/oauth/complete", requireInternalApiAuth, async (req, res) => {
  cleanupExpiredAdminOauthFlows();

  try {
    const flowId = String(req.body?.flowId || "").trim();
    const authorizationInput = String(
      req.body?.authorizationInput || req.body?.redirectUrl || req.body?.callbackUrl || req.body?.code || "",
    ).trim();
    const completionToken = String(req.body?.completionToken || "").trim();
    const payload = req.body?.payload || null;

    if (!flowId) {
      return res.status(400).json({
        ok: false,
        error: { code: "missing_flow_id", message: "flowId is required" },
      });
    }

    if (!authorizationInput) {
      return res.status(400).json({
        ok: false,
        error: { code: "missing_authorization_input", message: "authorizationInput is required" },
      });
    }

    const parsedAuthorization = parseOpenAICodexAuthorizationInput(authorizationInput);
    const flow = resolvePendingAdminOauthFlow({
      flowId,
      oauthState: parsedAuthorization.state,
    });
    if (!flow) {
      return res.status(404).json({
        ok: false,
        error: { code: "oauth_flow_not_found", message: "OAuth flow not found or expired" },
      });
    }

    if (flow.completed) {
      return res.status(409).json({
        ok: false,
        error: { code: "oauth_flow_completed", message: "OAuth flow was already completed" },
      });
    }

    if (flowId && flow.completionToken && flow.completionToken !== completionToken) {
      return res.status(403).json({
        ok: false,
        error: { code: "invalid_completion_token", message: "completionToken is invalid" },
      });
    }

    if (parsedAuthorization.state && flow.oauthState !== parsedAuthorization.state) {
      return res.status(400).json({
        ok: false,
        error: { code: "oauth_state_mismatch", message: "OAuth state mismatch" },
      });
    }

    if (!parsedAuthorization.code) {
      return res.status(400).json({
        ok: false,
        error: { code: "missing_authorization_code", message: "Authorization code is missing" },
      });
    }

    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.mkdirSync(WORKSPACE_DIR, { recursive: true });

    const creds = flow.cachedCreds || await exchangeOpenAICodexAuthorizationCode({
      code: parsedAuthorization.code,
      codeVerifier: flow.codeVerifier,
      redirectUri: flow.redirectUri,
    });
    flow.cachedCreds = creds;
    const persisted = await persistOpenAICodexOAuth(creds);
    const extra = await applyConfiguredSetupPayload(payload || flow.payload || {});
    flow.completed = true;
    pendingAdminOauthFlows.delete(flow.id);

    return res.json({
      ok: true,
      profileId: persisted.profileId,
      output: [
        "[oauth] OpenAI Codex OAuth completed.",
        persisted.output?.trim(),
        extra?.trim(),
      ]
        .filter(Boolean)
        .join("\n\n"),
    });
  } catch (err) {
    console.error("[/internal/openclaw/setup/oauth/complete] error:", err);
    return res.status(500).json({
      ok: false,
      error: { code: "oauth_complete_failed", message: String(err) },
    });
  }
});

app.post("/internal/openclaw/setup/claude-auth/start", requireInternalApiAuth, async (req, res) => {
  cleanupExpiredAdminClaudeFlows();

  try {
    const payload = req.body || {};
    const authChoice = await resolveAuthChoiceCompatibility(payload.authChoice);
    if (authChoice !== "claude-cli") {
      return res.status(400).json({
        ok: false,
        error: {
          code: "invalid_auth_choice",
          message: "Claude auth start only supports authChoice=claude-cli",
        },
      });
    }

    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.mkdirSync(WORKSPACE_DIR, { recursive: true });

    const flowId = crypto.randomUUID();
    const completionToken = crypto.randomBytes(32).toString("hex");
    const openerOrigin = String(payload.returnOrigin || payload.openerOrigin || "").trim();
    const flow = {
      id: flowId,
      completionToken,
      createdAt: Date.now(),
      payload,
      openerOrigin,
      completed: false,
      instructions:
        "Complete Claude Code login on the gateway host if needed, run `claude setup-token`, then paste the token into the hosted portal.",
    };

    pendingAdminClaudeFlows.set(flowId, flow);

    return res.json({
      ok: true,
      flowId,
      completionToken,
      instructions: flow.instructions,
      expiresAt: new Date(flow.createdAt + ADMIN_OAUTH_FLOW_TIMEOUT_MS).toISOString(),
      output:
        "[claude-auth] Open the hosted portal, paste a Claude setup-token from the gateway host, and OpenClaw will store it for the main agent.\n",
    });
  } catch (err) {
    console.error("[/internal/openclaw/setup/claude-auth/start] error:", err);
    return res.status(500).json({
      ok: false,
      error: { code: "claude_auth_start_failed", message: String(err) },
    });
  }
});

app.post("/internal/openclaw/setup/reset", requireInternalApiAuth, async (_req, res) => {
  try {
    try {
      await stopGateway();
    } catch { /* ignore */ }
    try {
      await stopClaudeMaxProxy();
    } catch { /* ignore */ }

    const candidates = typeof resolveConfigCandidates === "function" ? resolveConfigCandidates() : [configPath()];
    for (const p of candidates) {
      try { fs.rmSync(p, { force: true }); } catch {}
    }

    res.json({ ok: true, output: "Stopped gateway and deleted config file(s). You can rerun setup now." });
  } catch (err) {
    res.status(500).json({ ok: false, error: { code: "reset_failed", message: String(err) } });
  }
});

app.get("/internal/openclaw/setup/config/raw", requireInternalApiAuth, async (_req, res) => {
  try {
    const p = configPath();
    const exists = fs.existsSync(p);
    const content = exists ? fs.readFileSync(p, "utf8") : "";
    res.json({ ok: true, path: p, exists, content });
  } catch (err) {
    res.status(500).json({ ok: false, error: { code: "config_read_failed", message: String(err) } });
  }
});

app.post("/internal/openclaw/setup/config/raw", requireInternalApiAuth, async (req, res) => {
  try {
    const content = String((req.body && req.body.content) || "");
    if (content.length > 500_000) {
      return res.status(413).json({ ok: false, error: { code: "config_too_large", message: "Config too large" } });
    }

    fs.mkdirSync(STATE_DIR, { recursive: true });
    const p = configPath();
    if (fs.existsSync(p)) {
      const backupPath = `${p}.bak-${new Date().toISOString().replace(/[:.]/g, "-")}`;
      fs.copyFileSync(p, backupPath);
    }
    fs.writeFileSync(p, content, { encoding: "utf8", mode: 0o600 });
    await syncClaudeMaxProxyState();

    if (isConfigured()) {
      await restartGateway();
    }

    res.json({ ok: true, path: p });
  } catch (err) {
    res.status(500).json({ ok: false, error: { code: "config_write_failed", message: String(err) } });
  }
});

app.get("/internal/openclaw/setup/debug", requireInternalApiAuth, async (_req, res) => {
  try {
    const v = await runCmd(OPENCLAW_NODE, clawArgs(["--version"]));
    const qmd = await runCmd(OPENCLAW_MEMORY_QMD_COMMAND, ["--version"], {
      timeoutMs: 20_000,
    });
    const help = await runCmd(OPENCLAW_NODE, clawArgs(["channels", "add", "--help"]));
    const tg = await runCmd(OPENCLAW_NODE, clawArgs(["config", "get", "channels.telegram"]));
    const dc = await runCmd(OPENCLAW_NODE, clawArgs(["config", "get", "channels.discord"]));
    const memoryBackend = await runCmd(
      OPENCLAW_NODE,
      clawArgs(["config", "get", "memory.backend"]),
    );
    const memoryQmdCommand = await runCmd(
      OPENCLAW_NODE,
      clawArgs(["config", "get", "memory.qmd.command"]),
    );
    const claudeMaxProxy = await inspectClaudeMaxProxyStatus();

    res.json({
      ok: true,
      wrapper: {
        node: process.version,
        port: PORT,
        stateDir: STATE_DIR,
        workspaceDir: WORKSPACE_DIR,
        workspaceRealDir: resolveRealPathOrSelf(WORKSPACE_DIR),
        workspaceVolumeDir: WORKSPACE_VOLUME_DIR,
        workspaceUnified:
          resolveRealPathOrSelf(WORKSPACE_DIR) === resolveRealPathOrSelf(WORKSPACE_VOLUME_DIR),
        stateDirMode: safeMode(STATE_DIR),
        credentialsDirMode: safeMode(CREDENTIALS_DIR),
        configured: isConfigured(),
        configPathResolved: configPath(),
        gatewayTarget: GATEWAY_TARGET,
        gatewayRunning: Boolean(gatewayProc),
        lastGatewayError,
        lastGatewayExit,
        gatewayDesired,
        gatewayRestartAttempts,
        lastGatewayOutput,
      },
      openclaw: {
        version: v.output.trim(),
        claudeMaxProxy,
        qmd: {
          command: OPENCLAW_MEMORY_QMD_COMMAND,
          binaryPresent: qmd.code === 0,
          version: redactSecrets(qmd.output),
          indexPresent: fs.existsSync(QMD_INDEX_SQLITE_PATH),
          configuredBackend: redactSecrets(memoryBackend.output),
          configuredCommand: redactSecrets(memoryQmdCommand.output),
        },
        memoryCorpus: collectWorkspaceMemoryStats(),
        channelsAddHelpIncludesTelegram: help.output.includes("telegram"),
        channels: {
          telegram: { exit: tg.code, output: redactSecrets(tg.output) },
          discord: { exit: dc.code, output: redactSecrets(dc.output) },
        },
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: { code: "debug_failed", message: String(err) } });
  }
});

app.get("/internal/openclaw/setup/devices/pending", requireInternalApiAuth, async (_req, res) => {
  try {
    const r = await runCmd(OPENCLAW_NODE, clawArgs(["devices", "list"]));
    const output = redactSecrets(r.output);
    const requestIds = extractDeviceRequestIds(output);
    res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, requestIds, output });
  } catch (err) {
    res.status(500).json({ ok: false, error: { code: "devices_failed", message: String(err) } });
  }
});

app.post("/internal/openclaw/setup/devices/approve", requireInternalApiAuth, async (req, res) => {
  try {
    const requestId = String((req.body && req.body.requestId) || "").trim();
    if (!requestId) return res.status(400).json({ ok: false, error: { code: "missing_argument", message: "Missing device request ID" } });
    if (!/^[A-Za-z0-9_-]+$/.test(requestId)) return res.status(400).json({ ok: false, error: { code: "invalid_argument", message: "Invalid device request ID" } });
    const r = await runCmd(OPENCLAW_NODE, clawArgs(["devices", "approve", requestId]));
    res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, output: redactSecrets(r.output) });
  } catch (err) {
    res.status(500).json({ ok: false, error: { code: "devices_approve_failed", message: String(err) } });
  }
});

app.post("/internal/openclaw/setup/pairing/approve", requireInternalApiAuth, async (req, res) => {
  try {
    const { channel, code } = req.body || {};
    if (!channel || !code) {
      return res.status(400).json({ ok: false, error: { code: "missing_argument", message: "Missing channel or code" } });
    }
    const r = await runCmd(OPENCLAW_NODE, clawArgs(["pairing", "approve", String(channel), String(code)]));
    res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, output: r.output });
  } catch (err) {
    res.status(500).json({ ok: false, error: { code: "pairing_approve_failed", message: String(err) } });
  }
});

app.get("/setup/app.js", requireSetupAuth, (_req, res) => {
  // Serve JS for /setup (kept external to avoid inline encoding/template issues)
  res.type("application/javascript");
  res.send(fs.readFileSync(path.join(process.cwd(), "src", "setup-app.js"), "utf8"));
});

app.get("/setup", requireSetupAuth, (_req, res) => {
  // No inline <script>: serve JS from /setup/app.js to avoid any encoding/template-literal issues.
  res.type("html").send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>OpenClaw Setup</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; margin: 2rem; max-width: 900px; }
    .card { border: 1px solid #ddd; border-radius: 12px; padding: 1.25rem; margin: 1rem 0; }
    label { display:block; margin-top: 0.75rem; font-weight: 600; }
    input, select { width: 100%; padding: 0.6rem; margin-top: 0.25rem; }
    button { padding: 0.8rem 1.2rem; border-radius: 10px; border: 0; background: #111; color: #fff; font-weight: 700; cursor: pointer; }
    code { background: #f6f6f6; padding: 0.1rem 0.3rem; border-radius: 6px; }
    .muted { color: #555; }
  </style>
</head>
<body>
  <h1>OpenClaw Setup</h1>
  <p class="muted">This wizard configures OpenClaw by running the same onboarding command it uses in the terminal, but from the browser.</p>

  <div class="card">
    <h2>Status</h2>
    <div id="status">Loading...</div>
    <div id="statusDetails" class="muted" style="margin-top:0.5rem"></div>
    <div style="margin-top: 0.75rem">
      <a href="/openclaw" target="_blank">Open OpenClaw UI</a>
      &nbsp;|&nbsp;
      <a href="/setup/export" target="_blank">Download backup (.tar.gz)</a>
    </div>

    <div style="margin-top: 0.75rem">
      <div class="muted" style="margin-bottom:0.25rem"><strong>Import backup</strong> (advanced): restores into <code>/data</code> and restarts the gateway.</div>
      <input id="importFile" type="file" accept=".tar.gz,application/gzip" />
      <button id="importRun" style="background:#7c2d12; margin-top:0.5rem">Import</button>
      <pre id="importOut" style="white-space:pre-wrap"></pre>
    </div>
  </div>

  <div class="card">
    <h2>Debug console</h2>
    <p class="muted">Run a small allowlist of safe commands (no shell). Useful for debugging and recovery.</p>

    <div style="display:flex; gap:0.5rem; align-items:center">
      <select id="consoleCmd" style="flex: 1">
        <option value="gateway.restart">gateway.restart (wrapper-managed)</option>
        <option value="gateway.stop">gateway.stop (wrapper-managed)</option>
        <option value="gateway.start">gateway.start (wrapper-managed)</option>
        <option value="openclaw.status">openclaw status</option>
        <option value="openclaw.health">openclaw health</option>
        <option value="openclaw.doctor">openclaw doctor</option>
        <option value="openclaw.logs.tail">openclaw logs --tail N</option>
        <option value="openclaw.config.get">openclaw config get &lt;path&gt;</option>
        <option value="openclaw.models.list">openclaw models list --all</option>
        <option value="openclaw.models.set">openclaw models set &lt;provider/model-id&gt;</option>
        <option value="openclaw.version">openclaw --version</option>
        <option value="openclaw.devices.list">openclaw devices list</option>
        <option value="openclaw.devices.approve">openclaw devices approve &lt;requestId&gt;</option>
        <option value="openclaw.plugins.list">openclaw plugins list</option>
        <option value="openclaw.plugins.enable">openclaw plugins enable &lt;name&gt;</option>
      </select>
      <input id="consoleArg" placeholder="Optional arg (e.g. 200, gateway.port)" style="flex: 1" />
      <button id="consoleRun" style="background:#0f172a">Run</button>
    </div>
    <pre id="consoleOut" style="white-space:pre-wrap"></pre>
  </div>

  <div class="card">
    <h2>Config editor (advanced)</h2>
    <p class="muted">Edits the full config file on disk (JSON5). Saving creates a timestamped <code>.bak-*</code> backup and restarts the gateway.</p>
    <div class="muted" id="configPath"></div>
    <textarea id="configText" style="width:100%; height: 260px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;"></textarea>
    <div style="margin-top:0.5rem">
      <button id="configReload" style="background:#1f2937">Reload</button>
      <button id="configSave" style="background:#111; margin-left:0.5rem">Save</button>
    </div>
    <pre id="configOut" style="white-space:pre-wrap"></pre>
  </div>

  <div class="card">
    <h2>1) Model/auth provider</h2>
    <p class="muted">Matches the groups shown in the terminal onboarding.</p>
    <label>Provider group</label>
    <select id="authGroup">
      <option>Loading providers…</option>
    </select>

    <label>Auth method</label>
    <select id="authChoice">
      <option>Loading methods…</option>
    </select>

    <label>Key / Token (if required)</label>
    <input id="authSecret" type="password" placeholder="Paste API key / token if applicable" />

    <label>Wizard flow</label>
    <select id="flow">
      <option value="quickstart">quickstart</option>
      <option value="advanced">advanced</option>
      <option value="manual">manual</option>
    </select>
  </div>

  <div class="card">
    <h2>2) Optional: Channels</h2>
    <p class="muted">You can also add channels later inside OpenClaw, but this helps you get messaging working immediately.</p>

    <label>Telegram bot token (optional)</label>
    <input id="telegramToken" type="password" placeholder="123456:ABC..." />
    <div class="muted" style="margin-top: 0.25rem">
      Get it from BotFather: open Telegram, message <code>@BotFather</code>, run <code>/newbot</code>, then copy the token.
    </div>

    <label>Discord bot token (optional)</label>
    <input id="discordToken" type="password" placeholder="Bot token" />
    <div class="muted" style="margin-top: 0.25rem">
      Get it from the Discord Developer Portal: create an application, add a Bot, then copy the Bot Token.<br/>
      <strong>Important:</strong> Enable <strong>MESSAGE CONTENT INTENT</strong> in Bot → Privileged Gateway Intents, or the bot will crash on startup.
    </div>

    <label>Slack bot token (optional)</label>
    <input id="slackBotToken" type="password" placeholder="xoxb-..." />

    <label>Slack app token (optional)</label>
    <input id="slackAppToken" type="password" placeholder="xapp-..." />
  </div>

  <div class="card">
    <h2>2b) Advanced: Custom OpenAI-compatible provider (optional)</h2>
    <p class="muted">Use this to configure an OpenAI-compatible API that requires a custom base URL (e.g. Ollama, vLLM, LM Studio, hosted proxies). You usually set the API key as a Railway variable and reference it here.</p>

    <label>Provider id (e.g. ollama, deepseek, myproxy)</label>
    <input id="customProviderId" placeholder="ollama" />

    <label>Base URL (must include /v1, e.g. http://host:11434/v1)</label>
    <input id="customProviderBaseUrl" placeholder="http://127.0.0.1:11434/v1" />

    <label>API (openai-completions or openai-responses)</label>
    <select id="customProviderApi">
      <option value="openai-completions">openai-completions</option>
      <option value="openai-responses">openai-responses</option>
    </select>

    <label>API key env var name (optional, e.g. OLLAMA_API_KEY). Leave blank for no key.</label>
    <input id="customProviderApiKeyEnv" placeholder="OLLAMA_API_KEY" />

    <label>Optional model id to register (e.g. llama3.1:8b)</label>
    <input id="customProviderModelId" placeholder="" />
  </div>

  <div class="card">
    <h2>3) Run onboarding</h2>
    <button id="run">Run setup</button>
    <button id="pairingApprove" style="background:#1f2937; margin-left:0.5rem">Approve pairing</button>
    <button id="reset" style="background:#444; margin-left:0.5rem">Reset setup</button>
    <pre id="log" style="white-space:pre-wrap"></pre>
    <p class="muted">Reset deletes the OpenClaw config file so you can rerun onboarding. Pairing approval lets you grant DM access when dmPolicy=pairing.</p>

    <details style="margin-top: 0.75rem">
      <summary><strong>Pairing helper</strong> (for “disconnected (1008): pairing required”)</summary>
      <p class="muted">This lists pending device requests and lets you approve them without SSH.</p>
      <button id="devicesRefresh" style="background:#0f172a">Refresh pending devices</button>
      <div id="devicesList" class="muted" style="margin-top:0.5rem"></div>
    </details>
  </div>

  <script src="/setup/app.js"></script>
</body>
</html>`);
});

const AUTH_GROUPS = [
  { value: "openai", label: "OpenAI", hint: "Codex OAuth + API key", options: [
    { value: "openai-codex", label: "OpenAI Codex (ChatGPT OAuth)" },
    { value: "openai-api-key", label: "OpenAI API key" }
  ]},
  { value: "anthropic", label: "Anthropic", hint: "API key, setup-token, or Claude Max proxy", options: [
    { value: "claude-cli", label: "Anthropic token (Claude Code CLI)" },
    { value: "token", label: "Anthropic token (paste setup-token)" },
    { value: "apiKey", label: "Anthropic API key" },
    { value: "claude-max-proxy", label: "Claude Max API Proxy (Claude Code login)" }
  ]},
  { value: "google", label: "Google", hint: "Gemini API key + OAuth", options: [
    { value: "gemini-api-key", label: "Google Gemini API key" },
    { value: "google-antigravity", label: "Google Antigravity OAuth" },
    { value: "google-gemini-cli", label: "Google Gemini CLI OAuth" }
  ]},
  { value: "openrouter", label: "OpenRouter", hint: "API key", options: [
    { value: "openrouter-api-key", label: "OpenRouter API key" }
  ]},
  { value: "ai-gateway", label: "Vercel AI Gateway", hint: "API key", options: [
    { value: "ai-gateway-api-key", label: "Vercel AI Gateway API key" }
  ]},
  { value: "moonshot", label: "Moonshot AI", hint: "Kimi K2 + Kimi Code", options: [
    { value: "moonshot-api-key", label: "Moonshot AI API key" },
    { value: "kimi-code-api-key", label: "Kimi Code API key" }
  ]},
  { value: "zai", label: "Z.AI (GLM 4.7)", hint: "API key", options: [
    { value: "zai-api-key", label: "Z.AI (GLM 4.7) API key" }
  ]},
  { value: "minimax", label: "MiniMax", hint: "M2.1 (recommended)", options: [
    { value: "minimax-api", label: "MiniMax M2.1" },
    { value: "minimax-api-lightning", label: "MiniMax M2.1 Lightning" }
  ]},
  { value: "qwen", label: "Qwen", hint: "OAuth", options: [
    { value: "qwen-portal", label: "Qwen OAuth" }
  ]},
  { value: "copilot", label: "Copilot", hint: "GitHub + local proxy", options: [
    { value: "github-copilot", label: "GitHub Copilot (GitHub device login)" },
    { value: "copilot-proxy", label: "Copilot Proxy (local)" }
  ]},
  { value: "synthetic", label: "Synthetic", hint: "Anthropic-compatible (multi-model)", options: [
    { value: "synthetic-api-key", label: "Synthetic API key" }
  ]},
  { value: "opencode-zen", label: "OpenCode Zen", hint: "API key", options: [
    { value: "opencode-zen", label: "OpenCode Zen (multi-model proxy)" }
  ]}
];

function resolveLegacySetupAuthGroups() {
  return AUTH_GROUPS.map((group) => ({
    ...group,
    options: (group.options || []).filter((option) => option.value !== "openai-codex" && option.value !== "codex-cli"),
  })).filter((group) => (group.options || []).length > 0);
}

app.get("/setup/api/status", requireSetupAuth, async (_req, res) => {
  const version = await runCmd(OPENCLAW_NODE, clawArgs(["--version"]));
  const channelsHelp = await runCmd(OPENCLAW_NODE, clawArgs(["channels", "add", "--help"]));

  res.json({
    configured: isConfigured(),
    gatewayTarget: GATEWAY_TARGET,
    openclawVersion: version.output.trim(),
    channelsAddHelp: channelsHelp.output,
    authGroups: resolveLegacySetupAuthGroups(),
  });
});

app.get("/setup/api/auth-groups", requireSetupAuth, (_req, res) => {
  res.json({ ok: true, authGroups: resolveLegacySetupAuthGroups() });
});

let cachedOnboardHelp = { text: "", at: 0 };

async function getOnboardHelpText() {
  const now = Date.now();
  if (cachedOnboardHelp.text && now - cachedOnboardHelp.at < 5 * 60_000) {
    return cachedOnboardHelp.text;
  }

  const help = await runCmd(OPENCLAW_NODE, clawArgs(["onboard", "--help"]), {
    timeoutMs: 20_000,
  });

  cachedOnboardHelp = {
    text: String(help.output || ""),
    at: now,
  };

  return cachedOnboardHelp.text;
}

async function resolveAuthChoiceCompatibility(authChoice) {
  if (!authChoice) return authChoice;

  const help = (await getOnboardHelpText()).toLowerCase();
  const normalized = String(authChoice).trim();

  if (normalized === "claude-max-proxy") {
    return help.includes("--auth-choice") && help.includes("skip") ? "skip" : "skip";
  }

  if (normalized === "codex-cli") {
    return "openai-codex";
  }

  // Backward-compat: older OpenClaw builds may not expose Kimi Code as a
  // separate auth-choice. Fall back to Moonshot API key path in that case.
  if (normalized === "kimi-code-api-key" && !help.includes("kimi-code-api-key")) {
    return "moonshot-api-key";
  }

  return normalized;
}

async function buildOnboardArgs(payload) {
  const normalizedPayload = normalizeSetupPayload(payload);
  const args = [
    "onboard",
    "--non-interactive",
    "--accept-risk",
    "--json",
    "--no-install-daemon",
    "--skip-health",
    "--skip-skills",
    "--workspace",
    WORKSPACE_DIR,
    // The wrapper owns public networking; keep the gateway internal.
    "--gateway-bind",
    "loopback",
    "--gateway-port",
    String(INTERNAL_GATEWAY_PORT),
    "--gateway-auth",
    "token",
    "--gateway-token",
    OPENCLAW_GATEWAY_TOKEN,
    "--flow",
    normalizedPayload.flow || "quickstart",
  ];

  if (normalizedPayload.authChoice) {
    const resolvedAuthChoice = await resolveAuthChoiceCompatibility(normalizedPayload.authChoice);
    args.push("--auth-choice", resolvedAuthChoice);

    // Map secret to correct flag for common choices.
    const secret = (normalizedPayload.authSecret || "").trim();
    const map = {
      "openai-api-key": "--openai-api-key",
      "apiKey": "--anthropic-api-key",
      "openrouter-api-key": "--openrouter-api-key",
      "ai-gateway-api-key": "--ai-gateway-api-key",
      "moonshot-api-key": "--moonshot-api-key",
      "kimi-code-api-key": "--kimi-code-api-key",
      "gemini-api-key": "--gemini-api-key",
      "zai-api-key": "--zai-api-key",
      "minimax-api": "--minimax-api-key",
      "minimax-api-lightning": "--minimax-api-key",
      "synthetic-api-key": "--synthetic-api-key",
      "opencode-zen": "--opencode-zen-api-key",
    };

    const flag = map[resolvedAuthChoice];

    // If the user picked an API-key auth choice but didn't provide a secret, fail fast.
    // Otherwise OpenClaw may fall back to its default auth choice, which looks like the
    // wizard "reverted" their selection.
    if (flag && !secret) {
      throw new Error(`Missing auth secret for authChoice=${resolvedAuthChoice}`);
    }

    if (flag) {
      args.push(flag, secret);
    }

    if (resolvedAuthChoice === "token") {
      // This is the Anthropic setup-token flow.
      if (!secret) throw new Error("Missing auth secret for authChoice=token");
      args.push("--token-provider", "anthropic", "--token", secret);
    }
  }

  return args;
}

function applyCustomProviderConfig(payload) {
  const normalizedPayload = normalizeSetupPayload(payload);
  if (!normalizedPayload.customProviderId?.trim() || !normalizedPayload.customProviderBaseUrl?.trim()) {
    return {
      ok: true,
      changed: false,
      output: "",
      selectedAuthChoice: normalizedPayload.authChoice || "",
    };
  }

  const providerId = normalizedPayload.customProviderId.trim();
  const baseUrl = normalizedPayload.customProviderBaseUrl.trim();
  const api = (normalizedPayload.customProviderApi || "openai-completions").trim();
  const apiKeyEnv = (normalizedPayload.customProviderApiKeyEnv || "").trim();
  const modelId = (normalizedPayload.customProviderModelId || "").trim();

  if (!/^[A-Za-z0-9_-]+$/.test(providerId)) {
    return {
      ok: false,
      changed: false,
      output: "[custom provider] skipped: invalid provider id (use letters/numbers/_/-)",
      selectedAuthChoice: normalizedPayload.authChoice || "",
    };
  }
  if (!/^https?:\/\//.test(baseUrl)) {
    return {
      ok: false,
      changed: false,
      output: "[custom provider] skipped: baseUrl must start with http(s)://",
      selectedAuthChoice: normalizedPayload.authChoice || "",
    };
  }
  if (api !== "openai-completions" && api !== "openai-responses") {
    return {
      ok: false,
      changed: false,
      output: "[custom provider] skipped: api must be openai-completions or openai-responses",
      selectedAuthChoice: normalizedPayload.authChoice || "",
    };
  }
  if (apiKeyEnv && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(apiKeyEnv)) {
    return {
      ok: false,
      changed: false,
      output: "[custom provider] skipped: invalid api key env var name",
      selectedAuthChoice: normalizedPayload.authChoice || "",
    };
  }

  const isClaudeMaxPreset = isClaudeMaxProxyAuthChoice(payload.authChoice);
  const providerCfg = isClaudeMaxPreset
    ? buildClaudeMaxProxyProviderConfig()
    : {
        baseUrl,
        api,
        apiKey: apiKeyEnv ? "${" + apiKeyEnv + "}" : undefined,
        models: modelId ? [{ id: modelId, name: modelId }] : undefined,
      };

  const entries = [
    ["models.mode", "merge"],
    [`models.providers.${providerId}`, providerCfg],
  ];

  if (isClaudeMaxPreset) {
    const modelRef = buildClaudeMaxProxyModelRef(modelId || CLAUDE_MAX_PROXY_DEFAULT_MODEL);
    entries.push(["agents.defaults.model.primary", modelRef]);
    entries.push([`agents.defaults.models.${modelRef}`, { alias: "Claude Max" }]);
  }

  const patch = applyConfigPatch(entries);
  const lines = [
    `[custom provider] ${patch.ok ? "configured" : "failed"}`,
    patch.output || "",
  ];
  if (isClaudeMaxPreset) {
    lines.push(
      `[claude-max] provider=${CLAUDE_MAX_PROXY_PROVIDER_ID} model=${buildClaudeMaxProxyModelRef(modelId || CLAUDE_MAX_PROXY_DEFAULT_MODEL)} baseUrl=${CLAUDE_MAX_PROXY_BASE_URL}`,
    );
  }

  return {
    ok: patch.ok,
    changed: patch.changed,
    output: lines.filter(Boolean).join("\n"),
    selectedAuthChoice: normalizedPayload.authChoice || "",
  };
}

function buildManagedRuntimeConfigEntries() {
  return [
    ["gateway.mode", "local"],
    ["gateway.auth.mode", "token"],
    ["gateway.auth.token", OPENCLAW_GATEWAY_TOKEN],
    ["gateway.remote.token", OPENCLAW_GATEWAY_TOKEN],
    ["gateway.http.endpoints.chatCompletions.enabled", true],
    ["gateway.http.endpoints.responses.enabled", true],
    ["gateway.controlUi.allowInsecureAuth", OPENCLAW_CONTROL_UI_ALLOW_INSECURE_AUTH],
    ["gateway.bind", "loopback"],
    ["gateway.port", INTERNAL_GATEWAY_PORT],
    ["gateway.trustedProxies", ["127.0.0.1"]],
    ["commands.native", true],
    ["commands.nativeSkills", true],
    ["commands.text", true],
    ["commands.bash", true],
    ["commands.config", true],
    ["commands.debug", true],
    ["commands.restart", true],
    ["commands.useAccessGroups", false],
    ["tools.profile", "full"],
    ["tools.elevated.enabled", true],
    ["tools.exec.host", "gateway"],
    ["tools.exec.security", "full"],
    ["tools.exec.ask", "off"],
    ["tools.message.allowCrossContextSend", true],
    ["tools.message.crossContext.allowWithinProvider", true],
    ["tools.message.crossContext.allowAcrossProviders", true],
    ["tools.message.broadcast.enabled", true],
    ["tools.agentToAgent.enabled", true],
  ];
}

function buildSetupChannelConfigEntries(normalizedPayload, supportsChannel = () => true) {
  const entries = [];
  const lines = [];

  if (normalizedPayload.telegramToken?.trim()) {
    if (!supportsChannel("telegram")) {
      lines.push("[telegram] skipped (unsupported build)");
    } else {
      entries.push([
        "channels.telegram",
        {
          enabled: true,
          dmPolicy: "pairing",
          botToken: normalizedPayload.telegramToken.trim(),
          groupPolicy: "allowlist",
          streamMode: "partial",
        },
      ]);
      entries.push(["plugins.entries.telegram.enabled", true]);
      lines.push("[telegram] configured via channels.telegram + plugins.entries.telegram.enabled");
    }
  }

  if (normalizedPayload.discordToken?.trim()) {
    if (!supportsChannel("discord")) {
      lines.push("[discord] skipped (unsupported build)");
    } else {
      entries.push([
        "channels.discord",
        {
          enabled: true,
          token: normalizedPayload.discordToken.trim(),
          groupPolicy: "allowlist",
          dm: {
            policy: "pairing",
          },
        },
      ]);
      entries.push(["plugins.entries.discord.enabled", true]);
      lines.push("[discord] configured via channels.discord + plugins.entries.discord.enabled");
    }
  }

  if (normalizedPayload.slackBotToken?.trim() || normalizedPayload.slackAppToken?.trim()) {
    if (!supportsChannel("slack")) {
      lines.push("[slack] skipped (unsupported build)");
    } else {
      entries.push([
        "channels.slack",
        {
          enabled: true,
          botToken: normalizedPayload.slackBotToken?.trim() || undefined,
          appToken: normalizedPayload.slackAppToken?.trim() || undefined,
        },
      ]);
      entries.push(["plugins.entries.slack.enabled", true]);
      lines.push("[slack] configured via channels.slack + plugins.entries.slack.enabled");
    }
  }

  return {
    ok: true,
    entries,
    output: lines.join("\n"),
  };
}

function buildSetupCustomProviderConfig(payload) {
  const normalizedPayload = normalizeSetupPayload(payload);
  if (!normalizedPayload.customProviderId?.trim() || !normalizedPayload.customProviderBaseUrl?.trim()) {
    return {
      ok: true,
      entries: [],
      output: "",
      selectedAuthChoice: normalizedPayload.authChoice || "",
    };
  }

  const providerId = normalizedPayload.customProviderId.trim();
  const baseUrl = normalizedPayload.customProviderBaseUrl.trim();
  const api = (normalizedPayload.customProviderApi || "openai-completions").trim();
  const apiKeyEnv = (normalizedPayload.customProviderApiKeyEnv || "").trim();
  const modelId = (normalizedPayload.customProviderModelId || "").trim();

  if (!/^[A-Za-z0-9_-]+$/.test(providerId)) {
    return {
      ok: false,
      entries: [],
      output: "[custom provider] skipped: invalid provider id (use letters/numbers/_/-)",
      selectedAuthChoice: normalizedPayload.authChoice || "",
    };
  }
  if (!/^https?:\/\//.test(baseUrl)) {
    return {
      ok: false,
      entries: [],
      output: "[custom provider] skipped: baseUrl must start with http(s)://",
      selectedAuthChoice: normalizedPayload.authChoice || "",
    };
  }
  if (api !== "openai-completions" && api !== "openai-responses") {
    return {
      ok: false,
      entries: [],
      output: "[custom provider] skipped: api must be openai-completions or openai-responses",
      selectedAuthChoice: normalizedPayload.authChoice || "",
    };
  }
  if (apiKeyEnv && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(apiKeyEnv)) {
    return {
      ok: false,
      entries: [],
      output: "[custom provider] skipped: invalid api key env var name",
      selectedAuthChoice: normalizedPayload.authChoice || "",
    };
  }

  const isClaudeMaxPreset = isClaudeMaxProxyAuthChoice(payload.authChoice);
  const providerCfg = isClaudeMaxPreset
    ? buildClaudeMaxProxyProviderConfig()
    : {
        baseUrl,
        api,
        apiKey: apiKeyEnv ? "${" + apiKeyEnv + "}" : undefined,
        models: modelId ? [{ id: modelId, name: modelId }] : undefined,
      };

  const entries = [
    ["models.mode", "merge"],
    [`models.providers.${providerId}`, providerCfg],
  ];

  const lines = [];
  if (isClaudeMaxPreset) {
    const modelRef = buildClaudeMaxProxyModelRef(modelId || CLAUDE_MAX_PROXY_DEFAULT_MODEL);
    entries.push(["agents.defaults.model.primary", modelRef]);
    entries.push([`agents.defaults.models.${modelRef}`, { alias: "Claude Max" }]);
    lines.push(
      `[claude-max] provider=${CLAUDE_MAX_PROXY_PROVIDER_ID} model=${buildClaudeMaxProxyModelRef(modelId || CLAUDE_MAX_PROXY_DEFAULT_MODEL)} baseUrl=${CLAUDE_MAX_PROXY_BASE_URL}`,
    );
  }

  return {
    ok: true,
    entries,
    output: ["[custom provider] configured", ...lines].filter(Boolean).join("\n"),
    selectedAuthChoice: normalizedPayload.authChoice || "",
  };
}

async function buildSetupMemoryBackendDefaults() {
  if (!isConfigured()) {
    return {
      ok: false,
      reason: "not_configured",
      entries: [],
      output: "[memory] skipped: config not present",
    };
  }

  const backend = OPENCLAW_MEMORY_BACKEND.toLowerCase();
  const runtime = ensureMemorySearchRuntimeLayout();
  const memorySearchEntries = [
    ["agents.defaults.memorySearch.provider", runtime.provider],
    ["agents.defaults.memorySearch.fallback", runtime.fallback],
    ["agents.defaults.memorySearch.store.path", runtime.storePath],
  ];
  if (runtime.model) {
    memorySearchEntries.push(["agents.defaults.memorySearch.model", runtime.model]);
  }
  if (runtime.local) {
    memorySearchEntries.push(["agents.defaults.memorySearch.local.modelPath", runtime.local.modelPath]);
    memorySearchEntries.push(["agents.defaults.memorySearch.local.modelCacheDir", runtime.local.modelCacheDir]);
  }
  const memorySearchLines = [
    `[memory-search] ${describeMemorySearchRuntime(runtime)}`,
    ...runtime.warnings.map((warning) => `[memory-search] warning: ${warning}`),
    ...runtime.hints.map((hint) => `[memory-search] remediation: ${hint}`),
  ];

  if (backend !== "qmd") {
    return {
      ok: true,
      reason: "configured",
      entries: [["memory.backend", backend], ...memorySearchEntries],
      output: [`[memory] backend=${backend}`, ...memorySearchLines].filter(Boolean).join("\n"),
    };
  }

  const qmdVersion = await runCmd(OPENCLAW_MEMORY_QMD_COMMAND, ["--version"], {
    timeoutMs: 20_000,
  });
  if (qmdVersion.code !== 0) {
    return {
      ok: false,
      reason: "qmd_missing",
      entries: [],
      output: `[memory] qmd command unavailable (cmd=${OPENCLAW_MEMORY_QMD_COMMAND}) exit=${qmdVersion.code}\n${qmdVersion.output || ""}`,
    };
  }

  const workspaceQmdPaths = resolveWorkspaceQmdPaths();
  return {
    ok: true,
    reason: "configured",
    entries: [
      ["memory.backend", "qmd"],
      ["memory.qmd.command", OPENCLAW_MEMORY_QMD_COMMAND],
      ["memory.qmd.update.interval", OPENCLAW_MEMORY_QMD_UPDATE_INTERVAL],
      ["memory.qmd.update.waitForBootSync", OPENCLAW_MEMORY_QMD_WAIT_FOR_BOOT_SYNC],
      ["memory.qmd.update.commandTimeoutMs", OPENCLAW_MEMORY_QMD_COMMAND_TIMEOUT_MS],
      ["memory.qmd.update.updateTimeoutMs", OPENCLAW_MEMORY_QMD_UPDATE_TIMEOUT_MS],
      ["memory.qmd.update.embedTimeoutMs", OPENCLAW_MEMORY_QMD_EMBED_TIMEOUT_MS],
      ["memory.qmd.includeDefaultMemory", OPENCLAW_MEMORY_QMD_INCLUDE_DEFAULT_MEMORY],
      ["memory.qmd.paths", workspaceQmdPaths],
      ["memory.qmd.limits.timeoutMs", OPENCLAW_MEMORY_QMD_QUERY_TIMEOUT_MS],
      ["memory.qmd.scope.default", "allow"],
      ...memorySearchEntries,
    ],
    output: [
      `[memory-qmd] includeDefaultMemory=${OPENCLAW_MEMORY_QMD_INCLUDE_DEFAULT_MEMORY} workspaceIndex=${OPENCLAW_MEMORY_QMD_INDEX_WORKSPACE} paths=${workspaceQmdPaths.length} pattern=${OPENCLAW_MEMORY_QMD_WORKSPACE_PATTERN}`,
      ...memorySearchLines,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

function runCmd(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : 120_000;
    const { env: extraEnv, ...spawnOpts } = opts;

    const proc = childProcess.spawn(cmd, args, {
      ...spawnOpts,
      env: {
        ...process.env,
        ...extraEnv,
        // Railway containers can be tight on memory during onboarding.
        // Give Node-based OpenClaw subprocesses more headroom by default.
        NODE_OPTIONS: extraEnv?.NODE_OPTIONS || process.env.NODE_OPTIONS || "--max-old-space-size=1024",
        OPENCLAW_STATE_DIR: extraEnv?.OPENCLAW_STATE_DIR || STATE_DIR,
        OPENCLAW_WORKSPACE_DIR: extraEnv?.OPENCLAW_WORKSPACE_DIR || WORKSPACE_DIR,
      },
    });

    let out = "";
    proc.stdout?.on("data", (d) => (out += d.toString("utf8")));
    proc.stderr?.on("data", (d) => (out += d.toString("utf8")));

    let killTimer;
    const timer = setTimeout(() => {
      try { proc.kill("SIGTERM"); } catch {}
      killTimer = setTimeout(() => {
        try { proc.kill("SIGKILL"); } catch {}
      }, 2_000);
      out += `\n[timeout] Command exceeded ${timeoutMs}ms and was terminated.\n`;
      resolve({ code: 124, output: out });
    }, timeoutMs);

    proc.on("error", (err) => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      out += `\n[spawn error] ${String(err)}\n`;
      resolve({ code: 127, output: out });
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      resolve({ code: code ?? 0, output: out });
    });
  });
}

let openClawPiAiPromise = null;
const pendingAdminOauthFlows = new Map();
const pendingAdminClaudeFlows = new Map();

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function loadOpenClawPiAi() {
  if (!openClawPiAiPromise) {
    const requireFromOpenClaw = createRequire(OPENCLAW_PACKAGE_JSON);
    const resolved = requireFromOpenClaw.resolve("@mariozechner/pi-ai");
    openClawPiAiPromise = import(pathToFileURL(resolved).href);
  }
  return openClawPiAiPromise;
}

function toBase64Url(buffer) {
  return Buffer.from(buffer)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createOpenAICodexPkceVerifier() {
  return toBase64Url(crypto.randomBytes(32));
}

function createOpenAICodexPkceChallenge(codeVerifier) {
  return toBase64Url(crypto.createHash("sha256").update(codeVerifier).digest());
}

function buildOpenAICodexAuthorizationUrl({ codeVerifier, redirectUri, state }) {
  const url = new URL(OPENAI_CODEX_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", OPENAI_CODEX_CLIENT_ID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", OPENAI_CODEX_SCOPE);
  url.searchParams.set("code_challenge", createOpenAICodexPkceChallenge(codeVerifier));
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  url.searchParams.set("id_token_add_organizations", "true");
  url.searchParams.set("codex_cli_simplified_flow", "true");
  url.searchParams.set("originator", "pi");
  return url.toString();
}

function parseOpenAICodexAuthorizationInput(input) {
  const value = String(input || "").trim();
  if (!value) return {};

  try {
    const url = new URL(value);
    return {
      code: url.searchParams.get("code") || undefined,
      state: url.searchParams.get("state") || undefined,
    };
  } catch {
    // ignore
  }

  if (value.includes("code=")) {
    const params = new URLSearchParams(value);
    return {
      code: params.get("code") || undefined,
      state: params.get("state") || undefined,
    };
  }

  if (value.includes("#")) {
    const [code, state] = value.split("#", 2);
    return { code: code || undefined, state: state || undefined };
  }

  return { code: value };
}

function validateAnthropicSetupTokenInput(input) {
  const trimmed = String(input || "").trim();
  if (!trimmed) {
    return "Required";
  }
  if (!trimmed.startsWith(ANTHROPIC_SETUP_TOKEN_PREFIX)) {
    return `Expected token starting with ${ANTHROPIC_SETUP_TOKEN_PREFIX}`;
  }
  if (trimmed.length < ANTHROPIC_SETUP_TOKEN_MIN_LENGTH) {
    return "Token looks too short; paste the full setup-token";
  }
  return undefined;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function serializeForScript(value) {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

function decodeJwtPayload(token) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length !== 3) return null;
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function extractOpenAICodexAccountId(accessToken) {
  const payload = decodeJwtPayload(accessToken);
  const auth = payload?.[OPENAI_CODEX_JWT_CLAIM_PATH];
  const accountId = auth?.chatgpt_account_id;
  return typeof accountId === "string" && accountId ? accountId : null;
}

async function exchangeOpenAICodexAuthorizationCode({ code, codeVerifier, redirectUri }) {
  const response = await fetch(OPENAI_CODEX_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: OPENAI_CODEX_CLIENT_ID,
      code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`OpenAI Codex token exchange failed (${response.status}): ${text || "no response body"}`);
  }

  const json = await response.json();
  if (!json?.access_token || !json?.refresh_token || typeof json?.expires_in !== "number") {
    throw new Error("OpenAI Codex token response was missing required fields");
  }

  const accountId = extractOpenAICodexAccountId(json.access_token);
  if (!accountId) {
    throw new Error("Failed to extract accountId from OpenAI Codex access token");
  }

  return {
    access: json.access_token,
    refresh: json.refresh_token,
    expires: Date.now() + json.expires_in * 1000,
    accountId,
  };
}

function resolvePendingAdminOauthFlow({ flowId, oauthState }) {
  if (flowId) {
    return pendingAdminOauthFlows.get(flowId) || null;
  }

  if (!oauthState) {
    return null;
  }

  for (const flow of pendingAdminOauthFlows.values()) {
    if (flow.oauthState === oauthState) {
      return flow;
    }
  }

  return null;
}

function resolvePendingAdminClaudeFlow({ flowId, completionToken }) {
  if (!flowId) {
    return null;
  }
  const flow = pendingAdminClaudeFlows.get(flowId) || null;
  if (!flow) {
    return null;
  }
  if (completionToken && flow.completionToken !== completionToken) {
    return null;
  }
  return flow;
}

function resolveMainAgentDir() {
  return path.join(STATE_DIR, "agents", "main", "agent");
}

async function runOpenClawSourceEval(source, extraEnv = {}, timeoutMs = 60_000) {
  return runCmd(
    OPENCLAW_NODE,
    ["--import", "tsx", "--input-type=module", "--eval", source],
    {
      cwd: OPENCLAW_PACKAGE_ROOT,
      env: {
        ...process.env,
        OPENCLAW_STATE_DIR: STATE_DIR,
        OPENCLAW_WORKSPACE_DIR: WORKSPACE_DIR,
        ...extraEnv,
      },
      timeoutMs,
    },
  );
}

async function persistOpenAICodexOAuth(creds) {
  const agentDir = resolveMainAgentDir();
  const normalizedEmail = typeof creds?.email === "string" ? creds.email.trim() : "";
  const fallbackProfileId = `openai-codex:${normalizedEmail || "default"}`;
  const script = `
    import fs from "node:fs";
    import path from "node:path";
    import process from "node:process";
    import { writeOAuthCredentials } from "./src/commands/onboard-auth.credentials.js";
    import { readConfigFileSnapshot, writeConfigFile } from "./src/config/config.js";
    import { applyAuthProfileConfig } from "./src/commands/onboard-auth.config-core.js";
    import { applyOpenAICodexModelDefault } from "./src/commands/openai-codex-model-default.js";

    const agentDir = process.env.OPENCLAW_AGENT_DIR;
    const creds = JSON.parse(process.env.OPENCLAW_OAUTH_CREDS_JSON || "{}");
    const storedProfileId = await writeOAuthCredentials("openai-codex", creds, agentDir, {
      syncSiblingAgents: true,
    });
    const normalizedEmail =
      typeof creds.email === "string" && creds.email.trim() ? creds.email.trim() : "default";
    const profileId =
      typeof storedProfileId === "string" && storedProfileId.trim()
        ? storedProfileId.trim()
        : "openai-codex:" + normalizedEmail;

    const snapshot = await readConfigFileSnapshot();
    const baseConfig = snapshot.valid ? snapshot.config : {};
    const existingProfiles =
      baseConfig.auth && baseConfig.auth.profiles && typeof baseConfig.auth.profiles === "object"
        ? baseConfig.auth.profiles
        : {};
    const repairedProfiles =
      existingProfiles.undefined && existingProfiles.undefined.provider === "openai-codex"
        ? Object.fromEntries(Object.entries(existingProfiles).filter(([key]) => key !== "undefined"))
        : existingProfiles;
    const repairedConfig =
      repairedProfiles === existingProfiles
        ? baseConfig
        : {
            ...baseConfig,
            auth: {
              ...baseConfig.auth,
              profiles: repairedProfiles,
            },
          };
    let next = applyAuthProfileConfig(repairedConfig, {
      profileId,
      provider: "openai-codex",
      mode: "oauth",
    });
    next = applyOpenAICodexModelDefault(next).next;
    await writeConfigFile(next);
    const authJsonPath = path.join(agentDir, "auth.json");
    let authJson = {};
    try {
      authJson = JSON.parse(fs.readFileSync(authJsonPath, "utf8"));
    } catch {}
    authJson["openai-codex"] = {
      type: "oauth",
      access: creds.access,
      refresh: creds.refresh,
      expires: creds.expires,
    };
    fs.mkdirSync(agentDir, { recursive: true });
    fs.writeFileSync(authJsonPath, JSON.stringify(authJson, null, 2) + "\\n", {
      encoding: "utf8",
      mode: 0o600,
    });

    process.stdout.write(JSON.stringify({ ok: true, profileId }) + "\\n");
  `;

  const result = await runOpenClawSourceEval(
    script,
    {
      OPENCLAW_AGENT_DIR: agentDir,
      OPENCLAW_OAUTH_CREDS_JSON: JSON.stringify(creds),
    },
    90_000,
  );

  if (result.code !== 0) {
    throw new Error(`Failed to persist Codex OAuth:\n${result.output || "(no output)"}`);
  }

  const lines = String(result.output || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  let persistedProfileId = null;
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed && parsed.ok === true && typeof parsed.profileId === "string" && parsed.profileId.trim()) {
        persistedProfileId = parsed.profileId.trim();
      }
    } catch {
      // ignore non-JSON helper output
    }
  }

  return {
    profileId: persistedProfileId || fallbackProfileId,
    output: result.output || "",
  };
}

async function persistAnthropicSetupToken(token) {
  const agentDir = resolveMainAgentDir();
  const fallbackProfileId = "anthropic:default";
  const script = `
    import fs from "node:fs";
    import path from "node:path";
    import process from "node:process";
    import { upsertAuthProfile } from "./src/agents/auth-profiles.js";
    import { readConfigFileSnapshot, writeConfigFile } from "./src/config/config.js";
    import { applyAuthProfileConfig } from "./src/commands/onboard-auth.config-core.js";
    import { applyAgentDefaultModelPrimary } from "./src/commands/onboard-auth.config-shared.js";
    import { buildTokenProfileId, validateAnthropicSetupToken } from "./src/commands/auth-token.js";

    const agentDir = process.env.OPENCLAW_AGENT_DIR;
    const token = String(process.env.OPENCLAW_ANTHROPIC_SETUP_TOKEN || "").trim();
    const tokenError = validateAnthropicSetupToken(token);
    if (tokenError) {
      throw new Error(tokenError);
    }

    const profileId = buildTokenProfileId({ provider: "anthropic", name: "" });
    upsertAuthProfile({
      profileId,
      agentDir,
      credential: {
        type: "token",
        provider: "anthropic",
        token,
      },
    });

    const snapshot = await readConfigFileSnapshot();
    const baseConfig = snapshot.valid ? snapshot.config : {};
    let next = applyAuthProfileConfig(baseConfig, {
      profileId,
      provider: "anthropic",
      mode: "token",
    });
    next = applyAgentDefaultModelPrimary(next, ${JSON.stringify(DEFAULT_ANTHROPIC_MODEL_REF)});
    await writeConfigFile(next);

    const authJsonPath = path.join(agentDir, "auth.json");
    let authJson = {};
    try {
      authJson = JSON.parse(fs.readFileSync(authJsonPath, "utf8"));
    } catch {}
    authJson.anthropic = {
      type: "token",
      token,
    };
    fs.mkdirSync(agentDir, { recursive: true });
    fs.writeFileSync(authJsonPath, JSON.stringify(authJson, null, 2) + "\\n", {
      encoding: "utf8",
      mode: 0o600,
    });

    process.stdout.write(JSON.stringify({ ok: true, profileId }) + "\\n");
  `;

  const result = await runOpenClawSourceEval(
    script,
    {
      OPENCLAW_AGENT_DIR: agentDir,
      OPENCLAW_ANTHROPIC_SETUP_TOKEN: token,
    },
    90_000,
  );

  if (result.code !== 0) {
    throw new Error(`Failed to persist Anthropic setup-token:\n${result.output || "(no output)"}`);
  }

  const lines = String(result.output || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  let persistedProfileId = null;
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed && parsed.ok === true && typeof parsed.profileId === "string" && parsed.profileId.trim()) {
        persistedProfileId = parsed.profileId.trim();
      }
    } catch {
      // ignore helper output
    }
  }

  return {
    profileId: persistedProfileId || fallbackProfileId,
    output: result.output || "",
  };
}

function buildClaudeAuthMessagePage({
  ok,
  title,
  message,
  openerOrigin,
  messageType = "openclaw-claude-auth-complete",
}) {
  const payload = { type: messageType, ok, title, message };
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="font-family: sans-serif; padding: 24px; line-height: 1.5;">
  <h1 style="margin: 0 0 12px;">${escapeHtml(title)}</h1>
  <p style="margin: 0 0 16px;">${escapeHtml(message)}</p>
  <script>
    const payload = ${serializeForScript(payload)};
    const openerOrigin = ${serializeForScript(openerOrigin || "")};
    if (openerOrigin && window.opener && window.opener !== window) {
      window.opener.postMessage(payload, openerOrigin);
      setTimeout(() => window.close(), 150);
    }
  </script>
</body>
</html>`;
}

function renderClaudeAuthPortalPage({ flow, error = "", token = "" }) {
  const title = error ? "Claude auth failed" : "Claude auth";
  const message = error
    ? "Fix the setup-token and submit again."
    : "Paste the setup-token generated by Claude Code CLI on the gateway host.";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="font-family: sans-serif; max-width: 720px; margin: 0 auto; padding: 32px 20px; line-height: 1.5;">
  <h1 style="margin: 0 0 12px;">${escapeHtml(title)}</h1>
  <p style="margin: 0 0 16px;">${escapeHtml(message)}</p>
  <div style="margin: 0 0 20px; padding: 16px; border: 1px solid #d4d4d8; border-radius: 12px; background: #fafafa;">
    <p style="margin: 0 0 8px;"><strong>Supported OpenClaw flow</strong></p>
    <ol style="margin: 0; padding-left: 20px;">
      <li>Open Railway SSH for this core service.</li>
      <li>Run <code>claude setup-token</code> on the gateway host.</li>
      <li>Paste the resulting <code>${escapeHtml(ANTHROPIC_SETUP_TOKEN_PREFIX)}...</code> token below.</li>
    </ol>
  </div>
  ${
    error
      ? `<div style="margin: 0 0 16px; padding: 12px 14px; border: 1px solid #ef4444; border-radius: 10px; background: #fef2f2; color: #991b1b;">${escapeHtml(error)}</div>`
      : ""
  }
  <form method="post" action="/claude-auth" style="display: grid; gap: 12px;">
    <input type="hidden" name="flowId" value="${escapeHtml(flow.id)}" />
    <input type="hidden" name="completionToken" value="${escapeHtml(flow.completionToken)}" />
    <label for="setup-token"><strong>Anthropic setup-token</strong></label>
    <textarea id="setup-token" name="setupToken" rows="8" style="width: 100%; padding: 12px; font-family: monospace; border-radius: 10px; border: 1px solid #cbd5e1;" placeholder="${escapeHtml(ANTHROPIC_SETUP_TOKEN_PREFIX)}..." required>${escapeHtml(token)}</textarea>
    <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
      <button type="submit" style="padding: 10px 16px; border: 0; border-radius: 999px; background: #111827; color: white; cursor: pointer;">Store token in OpenClaw</button>
      <span style="color: #52525b; font-size: 14px;">Expires: ${escapeHtml(new Date(flow.createdAt + ADMIN_OAUTH_FLOW_TIMEOUT_MS).toLocaleString())}</span>
    </div>
  </form>
</body>
</html>`;
}

async function applyConfiguredSetupPayload(payload) {
  const normalizedPayload = normalizeSetupPayload(payload);
  let extra = "";
  const entries = [...buildManagedRuntimeConfigEntries()];
  const memoryDefaults = await buildSetupMemoryBackendDefaults();
  extra += `\n[memory backend] ${memoryDefaults.reason}`;
  if (memoryDefaults.output) {
    extra += `\n${memoryDefaults.output}`;
  }
  if (memoryDefaults.ok) {
    entries.push(...memoryDefaults.entries);
  }

  const providerPatch = buildSetupCustomProviderConfig(normalizedPayload);
  if (providerPatch.output) {
    extra += `\n${providerPatch.output}`;
  }
  if (providerPatch.ok) {
    entries.push(...providerPatch.entries);
  }

  const channelsHelp = await runCmd(OPENCLAW_NODE, clawArgs(["channels", "add", "--help"]));
  const helpText = channelsHelp.output || "";
  const supports = (name) => helpText.includes(name);
  const channelPatch = buildSetupChannelConfigEntries(normalizedPayload, supports);
  if (channelPatch.output) {
    extra += `\n${channelPatch.output}`;
  }
  entries.push(...channelPatch.entries);

  const runtimePatch = applyConfigPatch(entries);
  extra += `\n[runtime config] ${runtimePatch.ok ? "configured" : "failed"}`;
  if (runtimePatch.output) {
    extra += `\n${runtimePatch.output}`;
  }

  if (runtimePatch.ok && memoryDefaults.ok) {
    startMemoryIndexWarmup("configured-setup");
  }

  await restartGateway();
  const claudeMaxSync = await syncClaudeMaxProxyState();
  if (claudeMaxSync?.output) {
    extra += `\n${claudeMaxSync.output}`;
  }

  return extra;
}

function cleanupExpiredAdminOauthFlows() {
  const now = Date.now();
  for (const [flowId, flow] of pendingAdminOauthFlows.entries()) {
    if (now - flow.createdAt < ADMIN_OAUTH_FLOW_TIMEOUT_MS) {
      continue;
    }
    try {
      flow.deferred.reject(new Error("OAuth flow expired"));
    } catch {}
    pendingAdminOauthFlows.delete(flowId);
  }
}

function cleanupExpiredAdminClaudeFlows() {
  const now = Date.now();
  for (const [flowId, flow] of pendingAdminClaudeFlows.entries()) {
    if (now - flow.createdAt < ADMIN_OAUTH_FLOW_TIMEOUT_MS) {
      continue;
    }
    pendingAdminClaudeFlows.delete(flowId);
  }
}

async function applyMemoryBackendDefaults() {
  if (!isConfigured()) {
    return {
      ok: false,
      reason: "not_configured",
      output: "[memory] skipped: config not present",
    };
  }

  const backend = OPENCLAW_MEMORY_BACKEND.toLowerCase();
  const applyMemorySearchDefaults = async () => {
    const runtime = ensureMemorySearchRuntimeLayout();
    const entries = [
      ["agents.defaults.memorySearch.provider", runtime.provider],
      ["agents.defaults.memorySearch.fallback", runtime.fallback],
      ["agents.defaults.memorySearch.store.path", runtime.storePath],
    ];

    if (runtime.model) {
      entries.push(["agents.defaults.memorySearch.model", runtime.model]);
    }

    if (runtime.local) {
      entries.push(["agents.defaults.memorySearch.local.modelPath", runtime.local.modelPath]);
      entries.push([
        "agents.defaults.memorySearch.local.modelCacheDir",
        runtime.local.modelCacheDir,
      ]);
    }

    const patch = applyConfigPatch(entries);
    const output = [
      `[memory-search] ${describeMemorySearchRuntime(runtime)}`,
      ...runtime.warnings.map((warning) => `[memory-search] warning: ${warning}`),
      ...runtime.hints.map((hint) => `[memory-search] remediation: ${hint}`),
      patch.output || "",
    ].join("\n");

    return {
      ok: patch.ok,
      reason: patch.ok ? "memory_search_configured" : "memory_search_set_failed",
      output,
    };
  };

  if (backend !== "qmd") {
    const setBackend = applyConfigPatch([["memory.backend", backend]]);
    const memorySearch = await applyMemorySearchDefaults();
    return {
      ok: setBackend.ok && memorySearch.ok,
      reason:
        setBackend.ok && memorySearch.ok
          ? "configured"
          : !setBackend.ok
            ? "set_failed"
            : memorySearch.reason,
      output: [
        `[memory] backend=${backend}`,
        setBackend.output || "",
        memorySearch.output || "",
      ]
        .filter(Boolean)
        .join("\n"),
    };
  }

  const qmdVersion = await runCmd(OPENCLAW_MEMORY_QMD_COMMAND, ["--version"], {
    timeoutMs: 20_000,
  });
  if (qmdVersion.code !== 0) {
    return {
      ok: false,
      reason: "qmd_missing",
      output: `[memory] qmd command unavailable (cmd=${OPENCLAW_MEMORY_QMD_COMMAND}) exit=${qmdVersion.code}\n${qmdVersion.output || ""}`,
    };
  }

  const patch = applyConfigPatch([
    ["memory.backend", "qmd"],
    ["memory.qmd.command", OPENCLAW_MEMORY_QMD_COMMAND],
    ["memory.qmd.update.interval", OPENCLAW_MEMORY_QMD_UPDATE_INTERVAL],
    ["memory.qmd.update.waitForBootSync", OPENCLAW_MEMORY_QMD_WAIT_FOR_BOOT_SYNC],
    ["memory.qmd.update.commandTimeoutMs", OPENCLAW_MEMORY_QMD_COMMAND_TIMEOUT_MS],
    ["memory.qmd.update.updateTimeoutMs", OPENCLAW_MEMORY_QMD_UPDATE_TIMEOUT_MS],
    ["memory.qmd.update.embedTimeoutMs", OPENCLAW_MEMORY_QMD_EMBED_TIMEOUT_MS],
    ["memory.qmd.includeDefaultMemory", OPENCLAW_MEMORY_QMD_INCLUDE_DEFAULT_MEMORY],
    ["memory.qmd.paths", resolveWorkspaceQmdPaths()],
    ["memory.qmd.limits.timeoutMs", OPENCLAW_MEMORY_QMD_QUERY_TIMEOUT_MS],
    ["memory.qmd.scope.default", "allow"],
  ]);
  const memorySearch = await applyMemorySearchDefaults();
  const workspaceQmdPaths = resolveWorkspaceQmdPaths();
  const output = [
    `[memory-qmd] includeDefaultMemory=${OPENCLAW_MEMORY_QMD_INCLUDE_DEFAULT_MEMORY} workspaceIndex=${OPENCLAW_MEMORY_QMD_INDEX_WORKSPACE} paths=${workspaceQmdPaths.length} pattern=${OPENCLAW_MEMORY_QMD_WORKSPACE_PATTERN}`,
    patch.output || "",
    memorySearch.output || "",
  ]
    .filter(Boolean)
    .join("\n");
  return {
    ok: patch.ok && memorySearch.ok,
    reason: !patch.ok ? "set_failed" : memorySearch.ok ? "configured" : memorySearch.reason,
    output,
  };
}

function trimCommandOutput(output, limit = 4000) {
  const text = redactSecrets(String(output || ""));
  return text.length > limit ? `${text.slice(0, limit)}\n... (truncated)\n` : text;
}

function startMemoryIndexWarmup(reason = "boot") {
  if (!isConfigured() || memoryIndexWarmup || !OPENCLAW_MEMORY_WARMUP_ENABLED) {
    return;
  }

  const runtime = ensureMemorySearchRuntimeLayout();
  logMemorySearchRuntime(runtime, `warmup:${reason}`);
  memoryIndexWarmup = (async () => {
    console.log(`[memory-search] warmup starting reason=${reason}`);
    for (let attempt = 1; attempt <= OPENCLAW_MEMORY_WARMUP_RETRIES; attempt += 1) {
      ensureMemorySearchRuntimeLayout(runtime);
      const search = await runCmd(
        OPENCLAW_NODE,
        clawArgs(["memory", "search", "--agent", "main", "--json", OPENCLAW_MEMORY_QMD_WARMUP_QUERY]),
        {
          timeoutMs: OPENCLAW_MEMORY_WARMUP_TIMEOUT_MS,
        },
      );
      if (search.code === 0) {
        console.log(`[memory-search] warmup complete reason=${reason} attempt=${attempt}`);
        return;
      }

      console.warn(`[memory-search] warmup query warning: openclaw memory search exited ${search.code} attempt=${attempt}`);
      if (search.output) {
        console.warn(trimCommandOutput(search.output));
      }

      if (attempt < OPENCLAW_MEMORY_WARMUP_RETRIES) {
        const backoffMs = OPENCLAW_MEMORY_WARMUP_BACKOFF_MS * attempt;
        console.warn(`[memory-search] warmup retrying in ${backoffMs}ms`);
        await sleep(backoffMs);
      }
    }
    console.warn(`[memory-search] warmup exhausted after ${OPENCLAW_MEMORY_WARMUP_RETRIES} attempts`);
  })()
    .catch((err) => {
      console.warn(`[memory-search] warmup error: ${String(err)}`);
    })
    .finally(() => {
      memoryIndexWarmup = null;
    });
}

app.post("/setup/api/run", requireSetupAuth, async (req, res) => {
  try {
    const respondJson = (status, body) => {
      if (res.writableEnded || res.headersSent) return;
      res.status(status).json(body);
    };
    if (isConfigured()) {
      await ensureGatewayRunning();
      return respondJson(200, {
        ok: true,
        output: "Already configured.\nUse Reset setup if you want to rerun onboarding.\n",
      });
    }

    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.mkdirSync(WORKSPACE_DIR, { recursive: true });

    const payload = normalizeSetupPayload(req.body || {});
    const authChoice = await resolveAuthChoiceCompatibility(payload.authChoice);
    if (authChoice === "openai-codex" || authChoice === "claude-cli") {
      const label =
        authChoice === "openai-codex"
          ? "OpenAI Codex OAuth"
          : "Claude Code setup-token";
      return respondJson(400, {
        ok: false,
        output: [
          `Setup input error: ${label} is only supported from the web admin UI.`,
          "Open this URL and continue there:",
          "https://openclaw-web-reality-check.up.railway.app/admin",
        ].join("\n"),
      });
    }

    let onboardArgs;
    try {
      onboardArgs = await buildOnboardArgs(payload);
    } catch (err) {
      return respondJson(400, { ok: false, output: `Setup input error: ${String(err)}` });
    }

    const prefix = "[setup] running openclaw onboard...\n";
    const onboard = await runCmd(OPENCLAW_NODE, clawArgs(onboardArgs));

  let extra = "";

  const ok = onboard.code === 0 && isConfigured();

  if (ok) {
    extra = await applyConfiguredSetupPayload(payload);
  }

  return respondJson(ok ? 200 : 500, {
    ok,
    output: `${prefix}${onboard.output}${extra}`,
  });
  } catch (err) {
    console.error("[/setup/api/run] error:", err);
    return respondJson(500, { ok: false, output: `Internal error: ${String(err)}` });
  }
});

app.get("/setup/api/debug", requireSetupAuth, async (_req, res) => {
  const v = await runCmd(OPENCLAW_NODE, clawArgs(["--version"]));
  const qmd = await runCmd(OPENCLAW_MEMORY_QMD_COMMAND, ["--version"], {
    timeoutMs: 20_000,
  });
  const help = await runCmd(OPENCLAW_NODE, clawArgs(["channels", "add", "--help"]));

  // Channel config checks (redact secrets before returning to client)
  const tg = await runCmd(OPENCLAW_NODE, clawArgs(["config", "get", "channels.telegram"]));
  const dc = await runCmd(OPENCLAW_NODE, clawArgs(["config", "get", "channels.discord"]));
  const memoryBackend = await runCmd(OPENCLAW_NODE, clawArgs(["config", "get", "memory.backend"]));
  const memoryQmdCommand = await runCmd(OPENCLAW_NODE, clawArgs(["config", "get", "memory.qmd.command"]));
  const claudeMaxProxy = await inspectClaudeMaxProxyStatus();

  const tgOut = redactSecrets(tg.output || "");
  const dcOut = redactSecrets(dc.output || "");

  res.json({
    wrapper: {
      node: process.version,
      port: PORT,
      publicPortEnv: process.env.PORT || null,
      stateDir: STATE_DIR,
      workspaceDir: WORKSPACE_DIR,
      configured: isConfigured(),
      configPathResolved: configPath(),
      configPathCandidates: typeof resolveConfigCandidates === "function" ? resolveConfigCandidates() : null,
      internalGatewayHost: INTERNAL_GATEWAY_HOST,
      internalGatewayPort: INTERNAL_GATEWAY_PORT,
      gatewayTarget: GATEWAY_TARGET,
      gatewayRunning: Boolean(gatewayProc),
      gatewayTokenFromEnv: Boolean(process.env.OPENCLAW_GATEWAY_TOKEN?.trim()),
      gatewayTokenPersisted: fs.existsSync(path.join(STATE_DIR, "gateway.token")),
      lastGatewayError,
      lastGatewayExit,
      gatewayDesired,
      gatewayRestartAttempts,
      lastGatewayOutput,
      lastDoctorAt,
      lastDoctorOutput,
      railwayCommit: process.env.RAILWAY_GIT_COMMIT_SHA || null,
    },
    openclaw: {
      entry: OPENCLAW_ENTRY,
      node: OPENCLAW_NODE,
      version: v.output.trim(),
      claudeMaxProxy,
      qmd: {
        command: OPENCLAW_MEMORY_QMD_COMMAND,
        binaryPresent: qmd.code === 0,
        version: redactSecrets(qmd.output),
        configuredBackend: redactSecrets(memoryBackend.output),
        configuredCommand: redactSecrets(memoryQmdCommand.output),
      },
      channelsAddHelpIncludesTelegram: help.output.includes("telegram"),
      channels: {
        telegram: {
          exit: tg.code,
          configuredEnabled: /"enabled"\s*:\s*true/.test(tg.output || "") || /enabled\s*[:=]\s*true/.test(tg.output || ""),
          botTokenPresent: /(\d{5,}:[A-Za-z0-9_-]{10,})/.test(tg.output || ""),
          output: tgOut,
        },
        discord: {
          exit: dc.code,
          configuredEnabled: /"enabled"\s*:\s*true/.test(dc.output || "") || /enabled\s*[:=]\s*true/.test(dc.output || ""),
          tokenPresent: /"token"\s*:\s*"?\S+"?/.test(dc.output || "") || /token\s*[:=]\s*\S+/.test(dc.output || ""),
          output: dcOut,
        },
      },
    },
  });
});

// --- Debug console (Option A: allowlisted commands + config editor) ---

function redactSecrets(text) {
  if (!text) return text;
  // Very small best-effort redaction. (Config paths/values may still contain secrets.)
  return String(text)
    .replace(/(sk-[A-Za-z0-9_-]{10,})/g, "[REDACTED]")
    .replace(/(gho_[A-Za-z0-9_]{10,})/g, "[REDACTED]")
    .replace(/(xox[baprs]-[A-Za-z0-9-]{10,})/g, "[REDACTED]")
    // Telegram bot tokens look like: 123456:ABCDEF...
    .replace(/(\d{5,}:[A-Za-z0-9_-]{10,})/g, "[REDACTED]")
    .replace(/(AA[A-Za-z0-9_-]{10,}:\S{10,})/g, "[REDACTED]");
}

function extractDeviceRequestIds(text) {
  const s = String(text || "");
  const out = new Set();

  for (const m of s.matchAll(/requestId\s*(?:=|:)\s*([A-Za-z0-9_-]{6,})/g)) out.add(m[1]);
  for (const m of s.matchAll(/"requestId"\s*:\s*"([A-Za-z0-9_-]{6,})"/g)) out.add(m[1]);

  return Array.from(out);
}

const ALLOWED_CONSOLE_COMMANDS = new Set([
  // Wrapper-managed lifecycle
  "gateway.restart",
  "gateway.stop",
  "gateway.start",

  // OpenClaw CLI helpers
  "openclaw.version",
  "openclaw.status",
  "openclaw.health",
  "openclaw.doctor",
  "openclaw.logs.tail",
  "openclaw.config.get",
  "openclaw.models.list",
  "openclaw.models.set",

  // Device management (for fixing "disconnected (1008): pairing required")
  "openclaw.devices.list",
  "openclaw.devices.approve",

  // Plugin management
  "openclaw.plugins.list",
  "openclaw.plugins.enable",
]);

app.post("/setup/api/console/run", requireSetupAuth, async (req, res) => {
  const payload = req.body || {};
  const cmd = String(payload.cmd || "").trim();
  const arg = String(payload.arg || "").trim();

  if (!ALLOWED_CONSOLE_COMMANDS.has(cmd)) {
    return res.status(400).json({ ok: false, error: "Command not allowed" });
  }

  try {
    if (cmd === "gateway.restart") {
      await restartGateway();
      return res.json({ ok: true, output: "Gateway restarted (wrapper-managed).\n" });
    }
    if (cmd === "gateway.stop") {
      await stopGateway();
      return res.json({ ok: true, output: "Gateway stopped (wrapper-managed).\n" });
    }
    if (cmd === "gateway.start") {
      const r = await ensureGatewayRunning();
      return res.json({ ok: Boolean(r.ok), output: r.ok ? "Gateway started.\n" : `Gateway not started: ${r.reason}\n` });
    }

    if (cmd === "openclaw.version") {
      const r = await runCmd(OPENCLAW_NODE, clawArgs(["--version"]));
      return res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, output: redactSecrets(r.output) });
    }
    if (cmd === "openclaw.status") {
      const r = await runCmd(OPENCLAW_NODE, clawArgs(["status"]));
      return res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, output: redactSecrets(r.output) });
    }
    if (cmd === "openclaw.health") {
      const r = await runCmd(OPENCLAW_NODE, clawArgs(["health"]));
      return res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, output: redactSecrets(r.output) });
    }
    if (cmd === "openclaw.doctor") {
      const r = await runCmd(OPENCLAW_NODE, clawArgs(["doctor"]));
      return res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, output: redactSecrets(r.output) });
    }
    if (cmd === "openclaw.logs.tail") {
      const lines = Math.max(50, Math.min(1000, Number.parseInt(arg || "200", 10) || 200));
      const r = await runCmd(OPENCLAW_NODE, clawArgs(["logs", "--tail", String(lines)]));
      return res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, output: redactSecrets(r.output) });
    }
    if (cmd === "openclaw.config.get") {
      if (!arg) return res.status(400).json({ ok: false, error: "Missing config path" });
      const r = await runCmd(OPENCLAW_NODE, clawArgs(["config", "get", arg]));
      return res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, output: redactSecrets(r.output) });
    }
    if (cmd === "openclaw.models.list") {
      const r = await runCmd(OPENCLAW_NODE, clawArgs(["models", "list", "--all"]));
      return res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, output: redactSecrets(r.output) });
    }
    if (cmd === "openclaw.models.set") {
      const model = String(arg || "").trim();
      if (!model) return res.status(400).json({ ok: false, error: "Missing model id (provider/model-id)" });
      const r = await runCmd(OPENCLAW_NODE, clawArgs(["models", "set", model]));
      return res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, output: redactSecrets(r.output) });
    }

    // Device management commands (for fixing "disconnected (1008): pairing required")
    if (cmd === "openclaw.devices.list") {
      const r = await runCmd(OPENCLAW_NODE, clawArgs(["devices", "list"]));
      return res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, output: redactSecrets(r.output) });
    }
    if (cmd === "openclaw.devices.approve") {
      const requestId = String(arg || "").trim();
      if (!requestId) {
        return res.status(400).json({ ok: false, error: "Missing device request ID" });
      }
      if (!/^[A-Za-z0-9_-]+$/.test(requestId)) {
        return res.status(400).json({ ok: false, error: "Invalid device request ID" });
      }
      const r = await runCmd(OPENCLAW_NODE, clawArgs(["devices", "approve", requestId]));
      return res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, output: redactSecrets(r.output) });
    }

    // Plugin management commands
    if (cmd === "openclaw.plugins.list") {
      const r = await runCmd(OPENCLAW_NODE, clawArgs(["plugins", "list"]));
      return res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, output: redactSecrets(r.output) });
    }
    if (cmd === "openclaw.plugins.enable") {
      const name = String(arg || "").trim();
      if (!name) return res.status(400).json({ ok: false, error: "Missing plugin name" });
      if (!/^[A-Za-z0-9_-]+$/.test(name)) return res.status(400).json({ ok: false, error: "Invalid plugin name" });
      const r = await runCmd(OPENCLAW_NODE, clawArgs(["plugins", "enable", name]));
      return res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, output: redactSecrets(r.output) });
    }

    return res.status(400).json({ ok: false, error: "Unhandled command" });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
});

app.get("/setup/api/config/raw", requireSetupAuth, async (_req, res) => {
  try {
    const p = configPath();
    const exists = fs.existsSync(p);
    const content = exists ? fs.readFileSync(p, "utf8") : "";
    res.json({ ok: true, path: p, exists, content });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

app.post("/setup/api/config/raw", requireSetupAuth, async (req, res) => {
  try {
    const content = String((req.body && req.body.content) || "");
    if (content.length > 500_000) {
      return res.status(413).json({ ok: false, error: "Config too large" });
    }

    fs.mkdirSync(STATE_DIR, { recursive: true });

    const p = configPath();
    // Backup
    if (fs.existsSync(p)) {
      const backupPath = `${p}.bak-${new Date().toISOString().replace(/[:.]/g, "-")}`;
      fs.copyFileSync(p, backupPath);
    }

    fs.writeFileSync(p, content, { encoding: "utf8", mode: 0o600 });
    await syncClaudeMaxProxyState();

    // Apply immediately.
    if (isConfigured()) {
      await restartGateway();
    }

    res.json({ ok: true, path: p });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

app.post("/setup/api/pairing/approve", requireSetupAuth, async (req, res) => {
  const { channel, code } = req.body || {};
  if (!channel || !code) {
    return res.status(400).json({ ok: false, error: "Missing channel or code" });
  }
  const r = await runCmd(OPENCLAW_NODE, clawArgs(["pairing", "approve", String(channel), String(code)]));
  return res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, output: r.output });
});

// Device pairing helper (list + approve) to avoid needing SSH.
app.get("/setup/api/devices/pending", requireSetupAuth, async (_req, res) => {
  const r = await runCmd(OPENCLAW_NODE, clawArgs(["devices", "list"]));
  const output = redactSecrets(r.output);
  const requestIds = extractDeviceRequestIds(output);
  return res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, requestIds, output });
});

app.post("/setup/api/devices/approve", requireSetupAuth, async (req, res) => {
  const requestId = String((req.body && req.body.requestId) || "").trim();
  if (!requestId) return res.status(400).json({ ok: false, error: "Missing device request ID" });
  if (!/^[A-Za-z0-9_-]+$/.test(requestId)) return res.status(400).json({ ok: false, error: "Invalid device request ID" });
  const r = await runCmd(OPENCLAW_NODE, clawArgs(["devices", "approve", requestId]));
  return res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, output: redactSecrets(r.output) });
});

app.post("/setup/api/reset", requireSetupAuth, async (_req, res) => {
  // Reset: stop gateway (frees memory) + delete config file(s) so /setup can rerun.
  // Keep credentials/sessions/workspace by default.
  try {
    // Stop gateway to avoid running gateway + onboard concurrently on small Railway instances.
    try {
      await stopGateway();
    } catch {
      // ignore
    }
    try {
      await stopClaudeMaxProxy();
    } catch {
      // ignore
    }

    const candidates = typeof resolveConfigCandidates === "function" ? resolveConfigCandidates() : [configPath()];
    for (const p of candidates) {
      try { fs.rmSync(p, { force: true }); } catch {}
    }

    res.type("text/plain").send("OK - stopped gateway and deleted config file(s). You can rerun setup now.");
  } catch (err) {
    res.status(500).type("text/plain").send(String(err));
  }
});

app.get("/setup/export", requireSetupAuth, async (_req, res) => {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.mkdirSync(WORKSPACE_DIR, { recursive: true });

  res.setHeader("content-type", "application/gzip");
  res.setHeader(
    "content-disposition",
    `attachment; filename="openclaw-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.tar.gz"`,
  );

  // Prefer exporting from a common /data root so archives are easy to inspect and restore.
  // This preserves dotfiles like /data/.openclaw/openclaw.json.
  const stateAbs = resolveRealPathOrSelf(STATE_DIR);
  const workspaceAbs = resolveRealPathOrSelf(WORKSPACE_DIR);

  const dataRoot = DATA_ROOT;
  const underData = (p) => p === dataRoot || p.startsWith(dataRoot + path.sep);

  let cwd = "/";
  let paths = [stateAbs, workspaceAbs].map((p) => p.replace(/^\//, ""));

  if (underData(stateAbs) && underData(workspaceAbs)) {
    cwd = dataRoot;
    // We export relative to /data so the archive contains: .openclaw/... and workspace/...
    paths = [
      path.relative(dataRoot, stateAbs) || ".",
      path.relative(dataRoot, workspaceAbs) || ".",
    ];
  }

  const stream = tar.c(
    {
      gzip: true,
      portable: true,
      noMtime: true,
      cwd,
      onwarn: () => {},
    },
    paths,
  );

  stream.on("error", (err) => {
    console.error("[export]", err);
    if (!res.headersSent) res.status(500);
    res.end(String(err));
  });

  stream.pipe(res);
});

function isUnderDir(p, root) {
  const abs = resolveRealPathOrSelf(p);
  const r = resolveRealPathOrSelf(root);
  return abs === r || abs.startsWith(r + path.sep);
}

function looksSafeTarPath(p) {
  if (!p) return false;
  // tar paths always use / separators
  if (p.startsWith("/") || p.startsWith("\\")) return false;
  // windows drive letters
  if (/^[A-Za-z]:[\\/]/.test(p)) return false;
  // path traversal
  if (p.split("/").includes("..")) return false;
  return true;
}

async function readBodyBuffer(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error("payload too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// Import a backup created by /setup/export.
// This is intentionally limited to restoring into /data to avoid overwriting arbitrary host paths.
app.post("/setup/import", requireSetupAuth, async (req, res) => {
  try {
    const dataRoot = DATA_ROOT;
    if (!isUnderDir(STATE_DIR, dataRoot) || !isUnderDir(WORKSPACE_DIR, dataRoot)) {
      return res
        .status(400)
        .type("text/plain")
        .send("Import is only supported when OPENCLAW_STATE_DIR and OPENCLAW_WORKSPACE_DIR are under /data (Railway volume).\n");
    }

    // Stop gateway before restore so we don't overwrite live files.
    await stopGateway();

    const buf = await readBodyBuffer(req, 250 * 1024 * 1024); // 250MB max
    if (!buf.length) return res.status(400).type("text/plain").send("Empty body\n");

    // Extract into /data.
    // We only allow safe relative paths, and we intentionally do NOT delete existing files.
    // (Users can reset/redeploy or manually clean the volume if desired.)
    const tmpPath = path.join(os.tmpdir(), `openclaw-import-${Date.now()}.tar.gz`);
    fs.writeFileSync(tmpPath, buf);

    await tar.x({
      file: tmpPath,
      cwd: dataRoot,
      gzip: true,
      strict: true,
      onwarn: () => {},
      filter: (p) => {
        // Allow only paths that look safe.
        return looksSafeTarPath(p);
      },
    });

    try { fs.rmSync(tmpPath, { force: true }); } catch {}

    // Restart gateway after restore.
    if (isConfigured()) {
      await restartGateway();
    }

    res.type("text/plain").send("OK - imported backup into /data and restarted gateway.\n");
  } catch (err) {
    console.error("[import]", err);
    res.status(500).type("text/plain").send(String(err));
  }
});

// Proxy everything else to the gateway.
const proxy = httpProxy.createProxyServer({
  target: GATEWAY_TARGET,
  ws: true,
  xfwd: true,
});

proxy.on("error", (err, _req, res) => {
  const booting = Boolean(gatewayStarting);
  if (err?.code === "ECONNREFUSED" && booting) {
    const now = Date.now();
    if (now - lastProxyUnavailableLogAt > 10_000) {
      lastProxyUnavailableLogAt = now;
      console.warn("[proxy] gateway not ready yet; returning temporary unavailable");
    }
  } else {
    console.error("[proxy]", err);
  }
  try {
    if (res && typeof res.writeHead === "function" && !res.headersSent) {
      res.writeHead(booting ? 503 : 502, { "Content-Type": "text/plain" });
      res.end("Gateway unavailable\n");
    }
  } catch {
    // ignore
  }
});

// --- Dashboard password protection ---
// Require the same SETUP_PASSWORD for the entire Control UI dashboard,
// not just the /setup routes.  Healthcheck is excluded so Railway probes work.
function requireDashboardAuth(req, res, next) {
  if (req.path === "/healthz" || req.path === "/setup/healthz") return next();
  if (!SETUP_PASSWORD) return next(); // no password configured → open
  const header = req.headers.authorization || "";
  const [scheme, encoded] = header.split(" ");
  if (scheme !== "Basic" || !encoded) {
    res.set("WWW-Authenticate", 'Basic realm="OpenClaw Dashboard"');
    return res.status(401).send("Auth required");
  }
  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  const idx = decoded.indexOf(":");
  const password = idx >= 0 ? decoded.slice(idx + 1) : "";
  if (password !== SETUP_PASSWORD) {
    res.set("WWW-Authenticate", 'Basic realm="OpenClaw Dashboard"');
    return res.status(401).send("Invalid password");
  }
  return next();
}

// --- Gateway token injection ---
// The gateway is only reachable from this container. The Control UI in the browser
// cannot set custom Authorization headers for WebSocket connections, so we inject
// the token into proxied requests at the wrapper level.
function attachGatewayAuthHeader(req) {
  if (!OPENCLAW_GATEWAY_TOKEN) return;
  const existing = req?.headers?.authorization || "";
  if (!existing || /^Basic\s+/i.test(existing)) {
    req.headers.authorization = `Bearer ${OPENCLAW_GATEWAY_TOKEN}`;
  }
}

function gatewayProxyHeaders(req) {
  if (!OPENCLAW_GATEWAY_TOKEN) return undefined;
  const existing = req?.headers?.authorization || "";
  if (existing && !/^Basic\s+/i.test(existing)) return undefined;
  return { authorization: `Bearer ${OPENCLAW_GATEWAY_TOKEN}` };
}

function maybeBootstrapControlUiToken(req, res) {
  if (!OPENCLAW_GATEWAY_TOKEN) return false;
  if (req.method !== "GET") return false;
  if (req.path.startsWith("/setup")) return false;
  if (req.path === "/healthz" || req.path === "/setup/healthz") return false;
  if (/\.[a-zA-Z0-9]+$/.test(req.path)) return false;

  try {
    const current = new URL(req.originalUrl || req.url || "/", "http://local");
    if (current.searchParams.get("_oclboot") === "1") return false;

    current.searchParams.set("_oclboot", "1");
    const location = `${current.pathname}${current.search}#token=${encodeURIComponent(OPENCLAW_GATEWAY_TOKEN)}`;
    res.redirect(302, location);
    return true;
  } catch {
    return false;
  }
}

function attachGatewayAuthHeaderWs(proxyReq, req) {
  if (!OPENCLAW_GATEWAY_TOKEN) return;
  const existing = req?.headers?.authorization || "";
  if (existing && !/^Basic\s+/i.test(existing)) return;
  try {
    proxyReq.setHeader("Authorization", `Bearer ${OPENCLAW_GATEWAY_TOKEN}`);
  } catch {
    // ignore
  }
}

proxy.on("proxyReqWs", (proxyReq, req) => {
  attachGatewayAuthHeader(req);
  attachGatewayAuthHeaderWs(proxyReq, req);
});

app.use(requireDashboardAuth, async (req, res) => {
  // If not configured, force users to /setup for any non-setup routes.
  if (!isConfigured() && !req.path.startsWith("/setup")) {
    return res.redirect("/setup");
  }

  if (isConfigured()) {
    try {
      await ensureGatewayRunning();
    } catch (err) {
      const hint = [
        "Gateway not ready.",
        String(err),
        lastGatewayError ? `\n${lastGatewayError}` : "",
        lastGatewayOutput ? "\nRecent gateway output (tail):\n" + lastGatewayOutput : "",
        "\nTroubleshooting:",
        "- Visit /setup and check the Debug Console",
        "- Visit /setup/api/debug for config + gateway diagnostics",
      ].join("\n");
      return res.status(503).type("text/plain").send(hint);
    }
  }

  if (maybeBootstrapControlUiToken(req, res)) return;

  attachGatewayAuthHeader(req);
  return proxy.web(req, res, {
    target: GATEWAY_TARGET,
    headers: gatewayProxyHeaders(req),
  });
});

const server = app.listen(PORT, "0.0.0.0", async () => {
  console.log(`[wrapper] listening on :${PORT}`);
  console.log(`[wrapper] state dir: ${STATE_DIR}`);
  console.log(`[wrapper] workspace dir: ${WORKSPACE_DIR}`);
  console.log(`[wrapper] workspace real dir: ${resolveRealPathOrSelf(WORKSPACE_DIR)}`);
  logMemorySearchRuntime(ensureMemorySearchRuntimeLayout(), "boot");

  // Harden state dir for OpenClaw and avoid missing credentials dir on fresh volumes.
  try {
    fs.mkdirSync(CREDENTIALS_DIR, { recursive: true });
  } catch {}
  try {
    fs.chmodSync(STATE_DIR, 0o700);
  } catch {}
  try {
    fs.chmodSync(CREDENTIALS_DIR, 0o700);
  } catch {}

  console.log(`[wrapper] gateway token: ${OPENCLAW_GATEWAY_TOKEN ? "(set)" : "(missing)"}`);
  console.log(`[wrapper] gateway target: ${GATEWAY_TARGET}`);

  try {
    syncWorkspaceSqliteScaffold();
    console.log("[wrapper] sqlite scaffold synced into workspace");
  } catch (err) {
    console.warn(`[wrapper] failed to sync sqlite scaffold: ${String(err)}`);
  }

  if (!SETUP_PASSWORD) {
    console.warn("[wrapper] WARNING: SETUP_PASSWORD is not set; /setup will error.");
  }

  // Optional operator hook to install/persist extra tools under /data.
  // This is intentionally best-effort and should be used to set up persistent
  // prefixes (npm/pnpm/python venv), not to mutate the base image.
  const bootstrapPath = path.join(WORKSPACE_DIR, "bootstrap.sh");
  if (fs.existsSync(bootstrapPath)) {
    console.log(`[wrapper] running bootstrap: ${bootstrapPath}`);
    try {
      await runCmd("bash", [bootstrapPath], {
        env: {
          ...process.env,
          OPENCLAW_STATE_DIR: STATE_DIR,
          OPENCLAW_WORKSPACE_DIR: WORKSPACE_DIR,
        },
        timeoutMs: 10 * 60 * 1000,
      });
      console.log("[wrapper] bootstrap complete");
    } catch (err) {
      console.warn(`[wrapper] bootstrap failed (continuing): ${String(err)}`);
    }
  }

  // Sync gateway tokens in config with the current env var on every startup.
  // This prevents "gateway token mismatch" when OPENCLAW_GATEWAY_TOKEN changes
  // (e.g. Railway variable update) but the config file still has the old value.
  if (isConfigured() && OPENCLAW_GATEWAY_TOKEN) {
    console.log("[wrapper] syncing gateway tokens in config...");
    try {
      const runtimePatch = applyConfigPatch([
        ["gateway.auth.mode", "token"],
        ["gateway.auth.token", OPENCLAW_GATEWAY_TOKEN],
        ["gateway.remote.token", OPENCLAW_GATEWAY_TOKEN],
        ["gateway.http.endpoints.chatCompletions.enabled", true],
        ["gateway.http.endpoints.responses.enabled", true],
        ["gateway.controlUi.allowInsecureAuth", OPENCLAW_CONTROL_UI_ALLOW_INSECURE_AUTH],
        ["gateway.bind", "loopback"],
        ["gateway.port", INTERNAL_GATEWAY_PORT],
        ["gateway.trustedProxies", ["127.0.0.1"]],
        ["commands.native", true],
        ["commands.nativeSkills", true],
        ["commands.text", true],
        ["commands.bash", true],
        ["commands.config", true],
        ["commands.debug", true],
        ["commands.restart", true],
        ["commands.useAccessGroups", false],
        ["tools.profile", "full"],
        ["tools.elevated.enabled", true],
        ["tools.exec.host", "gateway"],
        ["tools.exec.security", "full"],
        ["tools.exec.ask", "off"],
        ["tools.message.allowCrossContextSend", true],
        ["tools.message.crossContext.allowWithinProvider", true],
        ["tools.message.crossContext.allowAcrossProviders", true],
        ["tools.message.broadcast.enabled", true],
        ["tools.agentToAgent.enabled", true],
      ]);
      console.log(`[wrapper] runtime config: ${runtimePatch.ok ? "configured" : "failed"}`);
      if (runtimePatch.output) {
        console.log(runtimePatch.output);
      }
      const memoryDefaults = await applyMemoryBackendDefaults();
      console.log(`[wrapper] memory backend: ${memoryDefaults.reason}`);
      if (memoryDefaults.output) {
        console.log(memoryDefaults.output);
      }
      if (memoryDefaults.ok) {
        startMemoryIndexWarmup("boot-sync");
      }
      const claudeMaxSync = await syncClaudeMaxProxyState();
      if (claudeMaxSync?.output) {
        console.log(claudeMaxSync.output);
      }
      console.log("[wrapper] gateway tokens synced");
    } catch (err) {
      console.warn(`[wrapper] failed to sync gateway tokens: ${String(err)}`);
    }
  }

  // Auto-start the gateway if already configured so polling channels (Telegram/Discord/etc.)
  // work even if nobody visits the web UI.
  if (isConfigured()) {
    console.log("[wrapper] config detected; starting gateway...");
    startMemoryIndexWarmup("boot-config-detected");
    try {
      const claudeMaxSync = await syncClaudeMaxProxyState();
      if (claudeMaxSync?.output) {
        console.log(claudeMaxSync.output);
      }
      await ensureGatewayRunning();
      console.log("[wrapper] gateway ready");
    } catch (err) {
      console.error(`[wrapper] gateway failed to start at boot: ${String(err)}`);
    }
  }
});

server.on("upgrade", async (req, socket, head) => {
  // Note: browsers cannot attach arbitrary HTTP headers (including Authorization: Basic)
  // in WebSocket handshakes. Do not enforce dashboard Basic auth at the upgrade layer.
  // The gateway authenticates at the protocol layer and we inject the gateway token below.

  if (!isConfigured()) {
    socket.destroy();
    return;
  }
  try {
    await ensureGatewayRunning();
  } catch {
    socket.destroy();
    return;
  }
  attachGatewayAuthHeader(req);
  proxy.ws(req, socket, head, {
    target: GATEWAY_TARGET,
    headers: gatewayProxyHeaders(req),
  });
});

process.on("SIGTERM", () => {
  // Best-effort shutdown
  stopGateway().catch(() => {});
  stopClaudeMaxProxy().catch(() => {});

  // Stop accepting new connections; allow in-flight requests to complete briefly.
  try {
    server.close(() => process.exit(0));
  } catch {
    process.exit(0);
  }

  setTimeout(() => process.exit(0), 5_000).unref?.();
});
