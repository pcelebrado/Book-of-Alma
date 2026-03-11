import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("core runtime no longer writes or queries the removed qmd searchMode key", () => {
  const src = fs.readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
  assert.doesNotMatch(src, /OPENCLAW_MEMORY_QMD_SEARCH_MODE/);
  assert.doesNotMatch(src, /config", "get", "memory\.qmd\.searchMode"/);
  assert.match(src, /removeConfigKeys\(\["memory\.qmd\.searchMode"\]\)/);
  assert.match(src, /delete process\.env\.BUN_INSTALL/);
});

test("core runtime force-sets control ui insecure auth for hosted Railway webchat", () => {
  const src = fs.readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
  assert.match(src, /OPENCLAW_CONTROL_UI_ALLOW_INSECURE_AUTH/);
  assert.match(src, /gateway\.controlUi\.allowInsecureAuth/);
  assert.match(src, /"gateway",\s*"run",\s*"--force"/);
  assert.match(src, /"memory\.qmd\.scope\.default",\s*"allow"/);
  assert.match(src, /OPENCLAW_GATEWAY_READY_TIMEOUT_MS/);
});

test("template env surfaces no longer expose the removed qmd searchMode setting", () => {
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
});

test("runtime defaults workspace qmd indexing to markdown globs", () => {
  const src = fs.readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
  assert.match(src, /OPENCLAW_MEMORY_QMD_WORKSPACE_PATTERN\?\.trim\(\) \|\| "\*\*\/\*\.md"/);
});

test("runtime bootstrap removes the legacy Alma verification note and keeps generic workspace memory seeds", () => {
  const bootstrap = fs.readFileSync(new URL("../scripts/runtime-bootstrap.sh", import.meta.url), "utf8");
  assert.match(bootstrap, /LEGACY_ALMA_MEMORY_FILE/);
  assert.match(bootstrap, /Removed legacy Alma verification seed/);
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
