import childProcess from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

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

// Railway injects PORT at runtime and routes traffic to that port.
// Do not force a different public port in the container image, or the service may
// boot but the Railway domain will be routed to a different port.
//
// OPENCLAW_PUBLIC_PORT is kept as an escape hatch for non-Railway deployments.
const PORT = Number.parseInt(process.env.PORT ?? process.env.OPENCLAW_PUBLIC_PORT ?? "3000", 10);

// State/workspace
// OpenClaw defaults to ~/.openclaw.
const STATE_DIR =
  process.env.OPENCLAW_STATE_DIR?.trim() ||
  path.join(os.homedir(), ".openclaw");

const WORKSPACE_DIR =
  process.env.OPENCLAW_WORKSPACE_DIR?.trim() ||
  path.join(STATE_DIR, "workspace");

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
const OPENCLAW_MEMORY_QMD_COMMAND = process.env.OPENCLAW_MEMORY_QMD_COMMAND?.trim() || "qmd";
const OPENCLAW_MEMORY_QMD_SEARCH_MODE = process.env.OPENCLAW_MEMORY_QMD_SEARCH_MODE?.trim() || "search";
const OPENCLAW_MEMORY_QMD_UPDATE_INTERVAL =
  process.env.OPENCLAW_MEMORY_QMD_UPDATE_INTERVAL?.trim() || "5m";

function parseBoolEnv(value, fallback) {
  if (value == null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

const OPENCLAW_MEMORY_QMD_WAIT_FOR_BOOT_SYNC = parseBoolEnv(
  process.env.OPENCLAW_MEMORY_QMD_WAIT_FOR_BOOT_SYNC,
  false,
);
const OPENCLAW_MEMORY_QMD_INCLUDE_DEFAULT_MEMORY = parseBoolEnv(
  process.env.OPENCLAW_MEMORY_QMD_INCLUDE_DEFAULT_MEMORY,
  true,
);

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

let gatewayProc = null;
let gatewayStarting = null;
let gatewayDesired = false;
let gatewayRestartTimer = null;
let gatewayRestartAttempts = 0;
let lastGatewayOutput = "";

// Debug breadcrumbs for common Railway failures (502 / "Application failed to respond").
let lastGatewayError = null;
let lastGatewayExit = null;
let lastDoctorOutput = null;
let lastDoctorAt = null;

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

function clearGatewayRestartTimer() {
  if (!gatewayRestartTimer) return;
  clearTimeout(gatewayRestartTimer);
  gatewayRestartTimer = null;
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
  const timeoutMs = opts.timeoutMs ?? 20_000;
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
    const msg = `[gateway] spawn error: ${String(err)}`;
    console.error(msg);
    lastGatewayError = msg;
    gatewayProc = null;
    scheduleGatewayRestart("spawn error");
  });

  gatewayProc.on("exit", (code, signal) => {
    const msg = `[gateway] exited code=${code} signal=${signal}`;
    console.error(msg);
    lastGatewayExit = { code, signal, at: new Date().toISOString() };
    gatewayProc = null;
    if (code === 0 || signal === "SIGTERM") {
      gatewayRestartAttempts = 0;
      return;
    }
    runDoctorBestEffort().catch(() => {});
    scheduleGatewayRestart(`exit code=${code} signal=${signal}`);
  });
}

async function stopGateway({ disableDesired = true } = {}) {
  if (disableDesired) gatewayDesired = false;
  clearGatewayRestartTimer();

  if (!gatewayProc) return;
  try {
    gatewayProc.kill("SIGTERM");
  } catch {
    // ignore
  }
  await sleep(750);
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
        const ready = await waitForGatewayReady({ timeoutMs: 20_000 });
        if (!ready) {
          throw new Error("Gateway did not become ready in time");
        }
        gatewayRestartAttempts = 0;
      } catch (err) {
        const msg = `[gateway] start failure: ${String(err)}`;
        lastGatewayError = msg;
        // Collect extra diagnostics to help users file issues.
        await runDoctorBestEffort();
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

// Minimal health endpoint for Railway.
app.get("/setup/healthz", (_req, res) => res.json({ ok: true }));

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
  if (isConfigured()) {
    try {
      gatewayReachable = await probeGateway();
    } catch {
      gatewayReachable = false;
    }
  }

  res.json({
    ok: true,
    wrapper: {
      configured: isConfigured(),
      stateDir: STATE_DIR,
      workspaceDir: WORKSPACE_DIR,
    },
    gateway: {
      target: GATEWAY_TARGET,
      reachable: gatewayReachable,
      lastError: lastGatewayError,
      lastExit: lastGatewayExit,
      lastDoctorAt,
    },
  });
});

app.get("/internal/health", requireInternalApiAuth, async (_req, res) => {
  let gatewayReachable = false;
  try {
    gatewayReachable = await probeGateway();
  } catch {
    gatewayReachable = false;
  }

  return res.json({
    ok: true,
    components: {
      wrapper: {
        configured: isConfigured(),
      },
      gateway: {
        reachable: gatewayReachable,
        target: GATEWAY_TARGET,
      },
      httpApi: {
        chatCompletions: "/v1/chat/completions",
        responses: "/v1/responses",
        toolsInvoke: "/tools/invoke",
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

    res.json({
      ok: true,
      configured: isConfigured(),
      gatewayTarget: GATEWAY_TARGET,
      openclawVersion: version.output.trim(),
      channelsAddHelp: channelsHelp.output,
      authGroups: AUTH_GROUPS,
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

    const payload = req.body || {};

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
      await runCmd(OPENCLAW_NODE, clawArgs(["config", "set", "gateway.auth.mode", "token"]));
      await runCmd(OPENCLAW_NODE, clawArgs(["config", "set", "gateway.auth.token", OPENCLAW_GATEWAY_TOKEN]));
      await runCmd(OPENCLAW_NODE, clawArgs(["config", "set", "gateway.remote.token", OPENCLAW_GATEWAY_TOKEN]));
      await runCmd(OPENCLAW_NODE, clawArgs(["config", "set", "gateway.http.endpoints.chatCompletions.enabled", "true"]));
      await runCmd(OPENCLAW_NODE, clawArgs(["config", "set", "gateway.http.endpoints.responses.enabled", "true"]));
      await runCmd(OPENCLAW_NODE, clawArgs(["config", "set", "gateway.bind", "loopback"]));
      await runCmd(OPENCLAW_NODE, clawArgs(["config", "set", "gateway.port", String(INTERNAL_GATEWAY_PORT)]));
      await runCmd(OPENCLAW_NODE, clawArgs(["config", "set", "--json", "gateway.trustedProxies", JSON.stringify(["127.0.0.1"])]));

      const memoryDefaults = await applyMemoryBackendDefaults();
      extra += `\n[memory backend] ${memoryDefaults.reason}`;
      if (memoryDefaults.output) {
        extra += `\n${memoryDefaults.output}`;
      }

      if (payload.customProviderId?.trim() && payload.customProviderBaseUrl?.trim()) {
        const providerId = payload.customProviderId.trim();
        const baseUrl = payload.customProviderBaseUrl.trim();
        const api = (payload.customProviderApi || "openai-completions").trim();
        const apiKeyEnv = (payload.customProviderApiKeyEnv || "").trim();
        const modelId = (payload.customProviderModelId || "").trim();

        if (!/^[A-Za-z0-9_-]+$/.test(providerId)) {
          extra += `\n[custom provider] skipped: invalid provider id`;
        } else if (!/^https?:\/\//.test(baseUrl)) {
          extra += `\n[custom provider] skipped: baseUrl must start with http(s)://`;
        } else if (api !== "openai-completions" && api !== "openai-responses") {
          extra += `\n[custom provider] skipped: api must be openai-completions or openai-responses`;
        } else if (apiKeyEnv && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(apiKeyEnv)) {
          extra += `\n[custom provider] skipped: invalid api key env var name`;
        } else {
          const providerCfg = {
            baseUrl,
            api,
            apiKey: apiKeyEnv ? "${" + apiKeyEnv + "}" : undefined,
            models: modelId ? [{ id: modelId, name: modelId }] : undefined,
          };
          await runCmd(OPENCLAW_NODE, clawArgs(["config", "set", "models.mode", "merge"]));
          const set = await runCmd(OPENCLAW_NODE, clawArgs(["config", "set", "--json", `models.providers.${providerId}`, JSON.stringify(providerCfg)]));
          extra += `\n[custom provider] exit=${set.code}\n${set.output || "(no output)"}`;
        }
      }

      const channelsHelp = await runCmd(OPENCLAW_NODE, clawArgs(["channels", "add", "--help"]));
      const helpText = channelsHelp.output || "";
      const supports = (name) => helpText.includes(name);

      if (payload.telegramToken?.trim()) {
        if (!supports("telegram")) {
          extra += "\n[telegram] skipped (unsupported build)\n";
        } else {
          const token = payload.telegramToken.trim();
          const cfgObj = { enabled: true, dmPolicy: "pairing", botToken: token, groupPolicy: "allowlist", streamMode: "partial" };
          const set = await runCmd(OPENCLAW_NODE, clawArgs(["config", "set", "--json", "channels.telegram", JSON.stringify(cfgObj)]));
          const get = await runCmd(OPENCLAW_NODE, clawArgs(["config", "get", "channels.telegram"]));
          const plug = await runCmd(OPENCLAW_NODE, clawArgs(["plugins", "enable", "telegram"]));
          extra += `\n[telegram config] exit=${set.code}\n[telegram verify] exit=${get.code}\n[telegram plugin] exit=${plug.code}`;
        }
      }

      if (payload.discordToken?.trim()) {
        if (!supports("discord")) {
          extra += "\n[discord] skipped (unsupported build)\n";
        } else {
          const token = payload.discordToken.trim();
          const cfgObj = { enabled: true, token, groupPolicy: "allowlist", dm: { policy: "pairing" } };
          const set = await runCmd(OPENCLAW_NODE, clawArgs(["config", "set", "--json", "channels.discord", JSON.stringify(cfgObj)]));
          const get = await runCmd(OPENCLAW_NODE, clawArgs(["config", "get", "channels.discord"]));
          extra += `\n[discord config] exit=${set.code}\n[discord verify] exit=${get.code}`;
        }
      }

      if (payload.slackBotToken?.trim() || payload.slackAppToken?.trim()) {
        if (!supports("slack")) {
          extra += "\n[slack] skipped (unsupported build)\n";
        } else {
          const cfgObj = {
            enabled: true,
            botToken: payload.slackBotToken?.trim() || undefined,
            appToken: payload.slackAppToken?.trim() || undefined,
          };
          const set = await runCmd(OPENCLAW_NODE, clawArgs(["config", "set", "--json", "channels.slack", JSON.stringify(cfgObj)]));
          const get = await runCmd(OPENCLAW_NODE, clawArgs(["config", "get", "channels.slack"]));
          extra += `\n[slack config] exit=${set.code}\n[slack verify] exit=${get.code}`;
        }
      }

      await restartGateway();
      const fix = await runCmd(OPENCLAW_NODE, clawArgs(["doctor", "--fix"]));
      extra += `\n[doctor --fix] exit=${fix.code}`;
      await restartGateway();
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

app.post("/internal/openclaw/setup/reset", requireInternalApiAuth, async (_req, res) => {
  try {
    try {
      await stopGateway();
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
    const memoryQmdSearchMode = await runCmd(
      OPENCLAW_NODE,
      clawArgs(["config", "get", "memory.qmd.searchMode"]),
    );

    res.json({
      ok: true,
      wrapper: {
        node: process.version,
        port: PORT,
        stateDir: STATE_DIR,
        workspaceDir: WORKSPACE_DIR,
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
        qmd: {
          command: OPENCLAW_MEMORY_QMD_COMMAND,
          binaryPresent: qmd.code === 0,
          version: redactSecrets(qmd.output),
          configuredBackend: redactSecrets(memoryBackend.output),
          configuredCommand: redactSecrets(memoryQmdCommand.output),
          configuredSearchMode: redactSecrets(memoryQmdSearchMode.output),
        },
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
    { value: "codex-cli", label: "OpenAI Codex OAuth (Codex CLI)" },
    { value: "openai-codex", label: "OpenAI Codex (ChatGPT OAuth)" },
    { value: "openai-api-key", label: "OpenAI API key" }
  ]},
  { value: "anthropic", label: "Anthropic", hint: "Claude Code CLI + API key", options: [
    { value: "claude-cli", label: "Anthropic token (Claude Code CLI)" },
    { value: "token", label: "Anthropic token (paste setup-token)" },
    { value: "apiKey", label: "Anthropic API key" }
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

app.get("/setup/api/status", requireSetupAuth, async (_req, res) => {
  const version = await runCmd(OPENCLAW_NODE, clawArgs(["--version"]));
  const channelsHelp = await runCmd(OPENCLAW_NODE, clawArgs(["channels", "add", "--help"]));

  res.json({
    configured: isConfigured(),
    gatewayTarget: GATEWAY_TARGET,
    openclawVersion: version.output.trim(),
    channelsAddHelp: channelsHelp.output,
    authGroups: AUTH_GROUPS,
  });
});

app.get("/setup/api/auth-groups", requireSetupAuth, (_req, res) => {
  res.json({ ok: true, authGroups: AUTH_GROUPS });
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

  // Backward-compat: older OpenClaw builds may not expose Kimi Code as a
  // separate auth-choice. Fall back to Moonshot API key path in that case.
  if (normalized === "kimi-code-api-key" && !help.includes("kimi-code-api-key")) {
    return "moonshot-api-key";
  }

  return normalized;
}

async function buildOnboardArgs(payload) {
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
    payload.flow || "quickstart",
  ];

  if (payload.authChoice) {
    const resolvedAuthChoice = await resolveAuthChoiceCompatibility(payload.authChoice);
    args.push("--auth-choice", resolvedAuthChoice);

    // Map secret to correct flag for common choices.
    const secret = (payload.authSecret || "").trim();
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

function runCmd(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : 120_000;

    const proc = childProcess.spawn(cmd, args, {
      ...opts,
      env: {
        ...process.env,
        // Railway containers can be tight on memory during onboarding.
        // Give Node-based OpenClaw subprocesses more headroom by default.
        NODE_OPTIONS: process.env.NODE_OPTIONS || "--max-old-space-size=1024",
        OPENCLAW_STATE_DIR: STATE_DIR,
        OPENCLAW_WORKSPACE_DIR: WORKSPACE_DIR,
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

async function applyMemoryBackendDefaults() {
  if (!isConfigured()) {
    return {
      ok: false,
      reason: "not_configured",
      output: "[memory] skipped: config not present",
    };
  }

  const backend = OPENCLAW_MEMORY_BACKEND.toLowerCase();
  if (backend !== "qmd") {
    const setBackend = await runCmd(
      OPENCLAW_NODE,
      clawArgs(["config", "set", "memory.backend", backend]),
    );
    return {
      ok: setBackend.code === 0,
      reason: setBackend.code === 0 ? "configured" : "set_failed",
      output: `[memory] backend=${backend} exit=${setBackend.code}\n${setBackend.output || ""}`,
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

  const steps = [];
  steps.push(
    await runCmd(OPENCLAW_NODE, clawArgs(["config", "set", "memory.backend", "qmd"])),
  );
  steps.push(
    await runCmd(
      OPENCLAW_NODE,
      clawArgs(["config", "set", "memory.qmd.command", OPENCLAW_MEMORY_QMD_COMMAND]),
    ),
  );
  steps.push(
    await runCmd(
      OPENCLAW_NODE,
      clawArgs(["config", "set", "memory.qmd.searchMode", OPENCLAW_MEMORY_QMD_SEARCH_MODE]),
    ),
  );
  steps.push(
    await runCmd(
      OPENCLAW_NODE,
      clawArgs([
        "config",
        "set",
        "memory.qmd.update.interval",
        OPENCLAW_MEMORY_QMD_UPDATE_INTERVAL,
      ]),
    ),
  );
  steps.push(
    await runCmd(
      OPENCLAW_NODE,
      clawArgs([
        "config",
        "set",
        "--json",
        "memory.qmd.update.waitForBootSync",
        JSON.stringify(OPENCLAW_MEMORY_QMD_WAIT_FOR_BOOT_SYNC),
      ]),
    ),
  );
  steps.push(
    await runCmd(
      OPENCLAW_NODE,
      clawArgs([
        "config",
        "set",
        "--json",
        "memory.qmd.includeDefaultMemory",
        JSON.stringify(OPENCLAW_MEMORY_QMD_INCLUDE_DEFAULT_MEMORY),
      ]),
    ),
  );

  const failed = steps.find((step) => step.code !== 0);
  const output = steps
    .map((step, index) => `[memory-step-${index + 1}] exit=${step.code}\n${step.output || ""}`)
    .join("\n");
  return {
    ok: !failed,
    reason: failed ? "set_failed" : "configured",
    output,
  };
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

    const payload = req.body || {};

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

  // Optional setup (only after successful onboarding).
  if (ok) {
    // Keep gateway in token mode and sync both auth + remote tokens for UI compatibility.
    await runCmd(OPENCLAW_NODE, clawArgs(["config", "set", "gateway.auth.mode", "token"]));
    await runCmd(OPENCLAW_NODE, clawArgs(["config", "set", "gateway.auth.token", OPENCLAW_GATEWAY_TOKEN]));
    await runCmd(OPENCLAW_NODE, clawArgs(["config", "set", "gateway.remote.token", OPENCLAW_GATEWAY_TOKEN]));
    await runCmd(
      OPENCLAW_NODE,
      clawArgs(["config", "set", "gateway.http.endpoints.chatCompletions.enabled", "true"]),
    );
    await runCmd(
      OPENCLAW_NODE,
      clawArgs(["config", "set", "gateway.http.endpoints.responses.enabled", "true"]),
    );
    await runCmd(OPENCLAW_NODE, clawArgs(["config", "set", "gateway.bind", "loopback"]));
    await runCmd(OPENCLAW_NODE, clawArgs(["config", "set", "gateway.port", String(INTERNAL_GATEWAY_PORT)]));

    // Railway runs behind a reverse proxy. Trust loopback as a proxy hop so local client detection
    // remains correct when X-Forwarded-* headers are present.
    await runCmd(
      OPENCLAW_NODE,
      clawArgs(["config", "set", "--json", "gateway.trustedProxies", JSON.stringify(["127.0.0.1"]) ]),
    );

    const memoryDefaults = await applyMemoryBackendDefaults();
    extra += `\n[memory backend] ${memoryDefaults.reason}`;
    if (memoryDefaults.output) {
      extra += `\n${memoryDefaults.output}`;
    }

    // Optional: configure a custom OpenAI-compatible provider (base URL) for advanced users.
    if (payload.customProviderId?.trim() && payload.customProviderBaseUrl?.trim()) {
      const providerId = payload.customProviderId.trim();
      const baseUrl = payload.customProviderBaseUrl.trim();
      const api = (payload.customProviderApi || "openai-completions").trim();
      const apiKeyEnv = (payload.customProviderApiKeyEnv || "").trim();
      const modelId = (payload.customProviderModelId || "").trim();

      if (!/^[A-Za-z0-9_-]+$/.test(providerId)) {
        extra += `\n[custom provider] skipped: invalid provider id (use letters/numbers/_/-)`;
      } else if (!/^https?:\/\//.test(baseUrl)) {
        extra += `\n[custom provider] skipped: baseUrl must start with http(s)://`;
      } else if (api !== "openai-completions" && api !== "openai-responses") {
        extra += `\n[custom provider] skipped: api must be openai-completions or openai-responses`;
      } else if (apiKeyEnv && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(apiKeyEnv)) {
        extra += `\n[custom provider] skipped: invalid api key env var name`;
      } else {
        const providerCfg = {
          baseUrl,
          api,
          apiKey: apiKeyEnv ? "${" + apiKeyEnv + "}" : undefined,
          models: modelId ? [{ id: modelId, name: modelId }] : undefined,
        };

        // Ensure we merge in this provider rather than replacing other providers.
        await runCmd(OPENCLAW_NODE, clawArgs(["config", "set", "models.mode", "merge"]));
        const set = await runCmd(
          OPENCLAW_NODE,
          clawArgs(["config", "set", "--json", `models.providers.${providerId}`, JSON.stringify(providerCfg)]),
        );
        extra += `\n[custom provider] exit=${set.code} (output ${set.output.length} chars)\n${set.output || "(no output)"}`;
      }
    }

    const channelsHelp = await runCmd(OPENCLAW_NODE, clawArgs(["channels", "add", "--help"]));
    const helpText = channelsHelp.output || "";

    const supports = (name) => helpText.includes(name);

    if (payload.telegramToken?.trim()) {
      if (!supports("telegram")) {
        extra += "\n[telegram] skipped (this openclaw build does not list telegram in `channels add --help`)\n";
      } else {
        // Avoid `channels add` here (it has proven flaky across builds); write config directly.
        const token = payload.telegramToken.trim();
        const cfgObj = {
          enabled: true,
          dmPolicy: "pairing",
          botToken: token,
          groupPolicy: "allowlist",
          streamMode: "partial",
        };
        const set = await runCmd(
          OPENCLAW_NODE,
          clawArgs(["config", "set", "--json", "channels.telegram", JSON.stringify(cfgObj)]),
        );
        const get = await runCmd(OPENCLAW_NODE, clawArgs(["config", "get", "channels.telegram"]));

        // Best-effort: enable the telegram plugin explicitly (some builds require this even when configured).
        const plug = await runCmd(OPENCLAW_NODE, clawArgs(["plugins", "enable", "telegram"]));

        extra += `\n[telegram config] exit=${set.code} (output ${set.output.length} chars)\n${set.output || "(no output)"}`;
        extra += `\n[telegram verify] exit=${get.code} (output ${get.output.length} chars)\n${get.output || "(no output)"}`;
        extra += `\n[telegram plugin enable] exit=${plug.code} (output ${plug.output.length} chars)\n${plug.output || "(no output)"}`;
      }
    }

    if (payload.discordToken?.trim()) {
      if (!supports("discord")) {
        extra += "\n[discord] skipped (this openclaw build does not list discord in `channels add --help`)\n";
      } else {
        const token = payload.discordToken.trim();
        const cfgObj = {
          enabled: true,
          token,
          groupPolicy: "allowlist",
          dm: {
            policy: "pairing",
          },
        };
        const set = await runCmd(
          OPENCLAW_NODE,
          clawArgs(["config", "set", "--json", "channels.discord", JSON.stringify(cfgObj)]),
        );
        const get = await runCmd(OPENCLAW_NODE, clawArgs(["config", "get", "channels.discord"]));
        extra += `\n[discord config] exit=${set.code} (output ${set.output.length} chars)\n${set.output || "(no output)"}`;
        extra += `\n[discord verify] exit=${get.code} (output ${get.output.length} chars)\n${get.output || "(no output)"}`;
      }
    }

    if (payload.slackBotToken?.trim() || payload.slackAppToken?.trim()) {
      if (!supports("slack")) {
        extra += "\n[slack] skipped (this openclaw build does not list slack in `channels add --help`)\n";
      } else {
        const cfgObj = {
          enabled: true,
          botToken: payload.slackBotToken?.trim() || undefined,
          appToken: payload.slackAppToken?.trim() || undefined,
        };
        const set = await runCmd(
          OPENCLAW_NODE,
          clawArgs(["config", "set", "--json", "channels.slack", JSON.stringify(cfgObj)]),
        );
        const get = await runCmd(OPENCLAW_NODE, clawArgs(["config", "get", "channels.slack"]));
        extra += `\n[slack config] exit=${set.code} (output ${set.output.length} chars)\n${set.output || "(no output)"}`;
        extra += `\n[slack verify] exit=${get.code} (output ${get.output.length} chars)\n${get.output || "(no output)"}`;
      }
    }

    // Apply changes immediately.
    await restartGateway();

    // Ensure OpenClaw applies any "configured but not enabled" channel/plugin changes.
    // This makes Telegram/Discord pairing issues much less "silent".
    const fix = await runCmd(OPENCLAW_NODE, clawArgs(["doctor", "--fix"]));
    extra += `\n[doctor --fix] exit=${fix.code} (output ${fix.output.length} chars)\n${fix.output || "(no output)"}`;

    // Doctor may require a restart depending on changes.
    await restartGateway();
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
  const memoryQmdSearchMode = await runCmd(OPENCLAW_NODE, clawArgs(["config", "get", "memory.qmd.searchMode"]));

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
      qmd: {
        command: OPENCLAW_MEMORY_QMD_COMMAND,
        binaryPresent: qmd.code === 0,
        version: redactSecrets(qmd.output),
        configuredBackend: redactSecrets(memoryBackend.output),
        configuredCommand: redactSecrets(memoryQmdCommand.output),
        configuredSearchMode: redactSecrets(memoryQmdSearchMode.output),
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
  const stateAbs = path.resolve(STATE_DIR);
  const workspaceAbs = path.resolve(WORKSPACE_DIR);

  const dataRoot = "/data";
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
  const abs = path.resolve(p);
  const r = path.resolve(root);
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
    const dataRoot = "/data";
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
  console.error("[proxy]", err);
  try {
    if (res && typeof res.writeHead === "function" && !res.headersSent) {
      res.writeHead(502, { "Content-Type": "text/plain" });
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

  // Harden state dir for OpenClaw and avoid missing credentials dir on fresh volumes.
  try {
    fs.mkdirSync(path.join(STATE_DIR, "credentials"), { recursive: true });
  } catch {}
  try {
    fs.chmodSync(STATE_DIR, 0o700);
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
      await runCmd(OPENCLAW_NODE, clawArgs(["config", "set", "gateway.auth.mode", "token"]));
      await runCmd(OPENCLAW_NODE, clawArgs(["config", "set", "gateway.auth.token", OPENCLAW_GATEWAY_TOKEN]));
      await runCmd(OPENCLAW_NODE, clawArgs(["config", "set", "gateway.remote.token", OPENCLAW_GATEWAY_TOKEN]));
      await runCmd(
        OPENCLAW_NODE,
        clawArgs(["config", "set", "gateway.http.endpoints.chatCompletions.enabled", "true"]),
      );
      await runCmd(
        OPENCLAW_NODE,
        clawArgs(["config", "set", "gateway.http.endpoints.responses.enabled", "true"]),
      );
      const memoryDefaults = await applyMemoryBackendDefaults();
      console.log(`[wrapper] memory backend: ${memoryDefaults.reason}`);
      console.log("[wrapper] gateway tokens synced");
    } catch (err) {
      console.warn(`[wrapper] failed to sync gateway tokens: ${String(err)}`);
    }
  }

  // Auto-start the gateway if already configured so polling channels (Telegram/Discord/etc.)
  // work even if nobody visits the web UI.
  if (isConfigured()) {
    console.log("[wrapper] config detected; starting gateway...");
    try {
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

  // Stop accepting new connections; allow in-flight requests to complete briefly.
  try {
    server.close(() => process.exit(0));
  } catch {
    process.exit(0);
  }

  setTimeout(() => process.exit(0), 5_000).unref?.();
});
