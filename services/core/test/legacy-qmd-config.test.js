import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("core runtime scrubs unsupported qmd searchMode for the pinned OpenClaw release", () => {
  const src = fs.readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
  assert.doesNotMatch(src, /OPENCLAW_MEMORY_QMD_SEARCH_MODE/);
  assert.match(src, /removeConfigKeys\(\["memory\.qmd\.searchMode"\]\)/);
  assert.match(src, /delete process\.env\.BUN_INSTALL/);
});

test("core runtime force-sets control ui insecure auth for hosted Railway webchat", () => {
  const src = fs.readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
  assert.match(src, /OPENCLAW_CONTROL_UI_ALLOW_INSECURE_AUTH/);
  assert.match(src, /gateway\.controlUi\.allowInsecureAuth/);
  assert.match(src, /"gateway",\s*"run",\s*"--force"/);
  assert.match(src, /detached:\s*process\.platform !== "win32"/);
  assert.match(src, /"memory\.qmd\.scope\.default",\s*"allow"/);
  assert.match(src, /"commands\.native",\s*true/);
  assert.match(src, /"commands\.restart",\s*true/);
  assert.match(src, /"commands\.useAccessGroups",\s*false/);
  assert.match(src, /"tools\.profile",\s*"full"/);
  assert.match(src, /"tools\.exec\.host",\s*"gateway"/);
  assert.match(src, /"tools\.exec\.security",\s*"full"/);
  assert.match(src, /"tools\.message\.crossContext\.allowAcrossProviders",\s*true/);
  assert.match(src, /"tools\.agentToAgent\.enabled",\s*true/);
  assert.match(src, /OPENCLAW_GATEWAY_READY_TIMEOUT_MS/);
  assert.match(src, /isGatewayProcessConflict/);
  assert.match(src, /process\.kill\(-proc\.pid,\s*signal\)/);
  assert.match(src, /reachable \|\| isGatewayProcessConflict/);
});

test("template env does not expose unsupported qmd searchMode on the pinned release", () => {
  const envExample = fs.readFileSync(new URL("../.env.example", import.meta.url), "utf8");
  const envRailway = fs.readFileSync(new URL("../.env.railway", import.meta.url), "utf8");

  assert.doesNotMatch(envExample, /OPENCLAW_MEMORY_QMD_SEARCH_MODE/);
  assert.doesNotMatch(envRailway, /OPENCLAW_MEMORY_QMD_SEARCH_MODE/);
  assert.match(envExample, /OPENCLAW_CONTROL_UI_ALLOW_INSECURE_AUTH=true/);
  assert.match(envRailway, /OPENCLAW_CONTROL_UI_ALLOW_INSECURE_AUTH=true/);
  assert.match(
    envExample,
    /OPENCLAW_MEMORY_QMD_COMMAND=\/root\/\.bun\/install\/global\/node_modules\/@tobilu\/qmd\/bin\/qmd/,
  );
  assert.match(
    envRailway,
    /OPENCLAW_MEMORY_QMD_COMMAND=\/root\/\.bun\/install\/global\/node_modules\/@tobilu\/qmd\/bin\/qmd/,
  );
  assert.match(envExample, /OPENCLAW_MEMORY_SEARCH_PROVIDER=local/);
  assert.match(envRailway, /OPENCLAW_MEMORY_SEARCH_PROVIDER=local/);
  assert.match(envExample, /OPENCLAW_MEMORY_QMD_INCLUDE_DEFAULT_MEMORY=false/);
  assert.match(envRailway, /OPENCLAW_MEMORY_QMD_INCLUDE_DEFAULT_MEMORY=false/);
  assert.match(envExample, /OPENCLAW_MEMORY_QMD_INDEX_WORKSPACE=true/);
  assert.match(envRailway, /OPENCLAW_MEMORY_QMD_INDEX_WORKSPACE=true/);
  assert.match(envExample, /OPENCLAW_MEMORY_QMD_WORKSPACE_PATTERN=\*\*\/\*\.md/);
  assert.match(envRailway, /OPENCLAW_MEMORY_QMD_WORKSPACE_PATTERN=\*\*\/\*\.md/);
  assert.match(envExample, /OPENCLAW_MEMORY_QMD_QUERY_TIMEOUT_MS=120000/);
  assert.match(envRailway, /OPENCLAW_MEMORY_QMD_QUERY_TIMEOUT_MS=120000/);
  assert.match(envExample, /OPENCLAW_MEMORY_QMD_COMMAND_TIMEOUT_MS=120000/);
  assert.match(envRailway, /OPENCLAW_MEMORY_QMD_COMMAND_TIMEOUT_MS=120000/);
  assert.match(envExample, /OPENCLAW_QMD_WARM_ON_BOOT=false/);
  assert.match(envRailway, /OPENCLAW_QMD_WARM_ON_BOOT=false/);
  assert.match(envExample, /OPENCLAW_MEMORY_WARMUP_ENABLED=false/);
  assert.match(envRailway, /OPENCLAW_MEMORY_WARMUP_ENABLED=false/);
  assert.match(envExample, /OPENCLAW_MEMORY_QMD_WARMUP_QUERY=test/);
  assert.match(envRailway, /OPENCLAW_MEMORY_QMD_WARMUP_QUERY=test/);
  assert.match(envExample, /OPENCLAW_MEMORY_WARMUP_TIMEOUT_MS=300000/);
  assert.match(envRailway, /OPENCLAW_MEMORY_WARMUP_TIMEOUT_MS=300000/);
  assert.match(envExample, /OPENCLAW_MEMORY_SEARCH_STORE_PATH=\/data\/\.openclaw\/memory\/\{agentId\}\.sqlite/);
  assert.match(envRailway, /OPENCLAW_MEMORY_SEARCH_STORE_PATH=\/data\/\.openclaw\/memory\/\{agentId\}\.sqlite/);
  assert.match(envExample, /OPENCLAW_CLAUDE_STATE_DIR=\/data\/\.claude/);
  assert.match(envRailway, /OPENCLAW_CLAUDE_STATE_DIR=\/data\/\.claude/);
  assert.match(envExample, /OPENCLAW_CLAUDE_MAX_PROXY_COMMAND=claude-max-api/);
  assert.match(envRailway, /OPENCLAW_CLAUDE_MAX_PROXY_COMMAND=claude-max-api/);
  assert.match(envExample, /OPENCLAW_CLAUDE_MAX_PROXY_BASE_URL=http:\/\/127\.0\.0\.1:3456\/v1/);
  assert.match(envRailway, /OPENCLAW_CLAUDE_MAX_PROXY_BASE_URL=http:\/\/127\.0\.0\.1:3456\/v1/);
});

test("runtime defaults workspace qmd indexing to markdown globs", () => {
  const src = fs.readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
  assert.match(src, /OPENCLAW_MEMORY_QMD_WORKSPACE_PATTERN\?\.trim\(\) \|\| "\*\*\/\*\.md"/);
  assert.match(src, /OPENCLAW_MEMORY_QMD_INCLUDE_DEFAULT_MEMORY,\s*false/);
});

test("runtime bootstrap removes the legacy Alma verification note and keeps generic workspace memory seeds", () => {
  const bootstrap = fs.readFileSync(new URL("../scripts/runtime-bootstrap.sh", import.meta.url), "utf8");
  assert.match(bootstrap, /LEGACY_ALMA_MEMORY_FILE/);
  assert.match(bootstrap, /CLAUDE_STATE_DIR/);
  assert.match(bootstrap, /CLAUDE_COMPAT_DIR/);
  assert.match(bootstrap, /Linked \$\{CLAUDE_COMPAT_DIR\} -> \$\{CLAUDE_STATE_DIR\}/);
  assert.match(bootstrap, /Removed legacy Alma verification seed/);
  assert.match(bootstrap, /WORKSPACE_SOURCE_SEED_DIR/);
  assert.match(bootstrap, /sync_workspace_source_of_truth/);
  assert.match(bootstrap, /openclaw-control-plane/);
  assert.match(bootstrap, /stalwart-single-control-plane-email-ops-pattern\.md/);
  assert.match(bootstrap, /BEGIN MANAGED OPENCLAW GOVERNANCE/);
  assert.match(bootstrap, /QMD_WARMUP_QUERY/);
  assert.match(bootstrap, /Skipping direct qmd update\/embed warmup/);
  assert.doesNotMatch(bootstrap, /collection add/);
  assert.doesNotMatch(bootstrap, /"\$\{QMD_COMMAND\}" update/);
  assert.doesNotMatch(bootstrap, /"\$\{QMD_COMMAND\}" embed/);
});

test("runtime image and entrypoint pin the direct qmd command path", () => {
  const dockerfile = fs.readFileSync(new URL("../Dockerfile", import.meta.url), "utf8");
  const entrypoint = fs.readFileSync(new URL("../scripts/entrypoint.sh", import.meta.url), "utf8");
  assert.match(
    dockerfile,
    /ENV OPENCLAW_MEMORY_QMD_COMMAND=\/root\/\.bun\/install\/global\/node_modules\/@tobilu\/qmd\/bin\/qmd/,
  );
  assert.match(
    entrypoint,
    /OPENCLAW_MEMORY_QMD_COMMAND:\-\/root\/\.bun\/install\/global\/node_modules\/@tobilu\/qmd\/bin\/qmd/,
  );
  assert.match(dockerfile, /npm install -g @anthropic-ai\/claude-code claude-max-api-proxy/);
  assert.match(dockerfile, /COPY workspace-seed \.\/workspace-seed/);
  assert.match(dockerfile, /ENV OPENCLAW_CLAUDE_STATE_DIR=\/data\/\.claude/);
  assert.match(entrypoint, /OPENCLAW_CLAUDE_STATE_DIR:\-\$\{OPENCLAW_DATA_ROOT\}\/\.claude/);
  assert.match(entrypoint, /CLAUDE_CONFIG_DIR:\-\$\{OPENCLAW_CLAUDE_STATE_DIR\}/);
});

test("workspace qmd indexes the whole working directory as one collection", () => {
  const src = fs.readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
  assert.match(
    src,
    /return \[\s*\{\s*name: "workspace",[\s\S]*path: WORKSPACE_DIR,[\s\S]*pattern: OPENCLAW_MEMORY_QMD_WORKSPACE_PATTERN,/,
  );
  assert.doesNotMatch(
    src,
    /name: `workspace-file-\$\{slug\}`/,
  );
});

test("runtime scrubs stale qmd workspace collections from persisted agent state", () => {
  const src = fs.readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
  assert.match(src, /Reset stale QMD workspace state for agent/);
  assert.match(src, /workspace-\[\^:\\r\\n\]\+:/);
  assert.match(src, /index\.sqlite-wal/);
});

test("runtime warmup uses memory search without forcing a full memory index", () => {
  const src = fs.readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
  assert.match(src, /OPENCLAW_MEMORY_WARMUP_ENABLED = parseBoolEnv/);
  assert.match(src, /OPENCLAW_MEMORY_QMD_COMMAND_TIMEOUT_MS/);
  assert.match(src, /OPENCLAW_MEMORY_WARMUP_TIMEOUT_MS/);
  assert.match(src, /OPENCLAW_MEMORY_QMD_WARMUP_QUERY\?\.trim\(\) \|\| "test"/);
  assert.match(src, /"memory\.qmd\.update\.commandTimeoutMs", OPENCLAW_MEMORY_QMD_COMMAND_TIMEOUT_MS/);
  assert.match(src, /clawArgs\(\["memory", "search", "--agent", "main", "--json", OPENCLAW_MEMORY_QMD_WARMUP_QUERY\]\)/);
  assert.match(src, /!OPENCLAW_MEMORY_WARMUP_ENABLED/);
  assert.doesNotMatch(src, /clawArgs\(\["memory", "index", "--agent", "main"\]\)/);
  assert.match(src, /writeHead\(booting \? 503 : 502/);
});

test("core exposes Claude Max proxy as an Anthropic admin preset and supervises the local proxy", () => {
  const src = fs.readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
  assert.match(src, /claude-max-proxy/);
  assert.match(src, /Claude Max API Proxy \(Claude Code login\)/);
  assert.match(src, /buildClaudeMaxProxyProviderConfig/);
  assert.match(src, /syncClaudeMaxProxyState/);
  assert.match(src, /models\.providers\.\$\{CLAUDE_MAX_PROXY_PROVIDER_ID\}/);
  assert.match(src, /agents\.defaults\.model\.primary/);
});

test("hosted Claude auth portal stores Anthropic setup-tokens through the admin UI flow", () => {
  const coreSrc = fs.readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
  const webAdmin = fs.readFileSync(
    new URL("../../web/src/app/admin/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(coreSrc, /app\.get\("\/claude-auth"/);
  assert.match(coreSrc, /app\.post\("\/claude-auth"/);
  assert.match(coreSrc, /\/internal\/openclaw\/setup\/claude-auth\/start/);
  assert.match(coreSrc, /persistAnthropicSetupToken/);
  assert.match(coreSrc, /validateAnthropicSetupTokenInput/);
  assert.match(webAdmin, /\/api\/admin\/openclaw\/setup\/claude-auth\/start/);
  assert.match(webAdmin, /openclaw-claude-auth-complete/);
  assert.match(webAdmin, /Start Claude Auth/);
});

test("onboarding setup applies wrapper-managed config in one pass without doctor or plugin CLI churn", () => {
  const src = fs.readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
  assert.match(src, /function buildManagedRuntimeConfigEntries\(/);
  assert.match(src, /function buildSetupChannelConfigEntries\(/);
  assert.match(src, /function buildSetupMemoryBackendDefaults\(/);
  assert.match(src, /const runtimePatch = applyConfigPatch\(entries\)/);
  assert.match(src, /extra = await applyConfiguredSetupPayload\(payload\);/);
  assert.match(src, /const providerPatch = buildSetupCustomProviderConfig\(payload\);/);
  assert.doesNotMatch(src, /clawArgs\(\["plugins", "enable", "telegram"\]\)/);
  assert.doesNotMatch(src, /clawArgs\(\["doctor", "--fix"\]\)/);
});

test("runtime reconciles auth profiles from persisted agent state and backup snapshots", () => {
  const src = fs.readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
  assert.match(src, /function listConfigBackupPaths\(/);
  assert.match(src, /function collectRecoverableAuthProfiles\(/);
  assert.match(src, /auth-profiles\.json/);
  assert.match(src, /function reconcileConfiguredAuthProfiles\(/);
  assert.match(src, /reconcilePersistedAuthProfilesOnBoot/);
  assert.match(src, /reconcileConfiguredAuthProfiles\("configured-setup"\)/);
});
