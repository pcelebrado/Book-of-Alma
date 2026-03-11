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
  assert.match(envExample, /OPENCLAW_MEMORY_QMD_WORKSPACE_PATTERN=\*\*\/\*/);
  assert.match(envRailway, /OPENCLAW_MEMORY_QMD_WORKSPACE_PATTERN=\*\*\/\*/);
  assert.match(envExample, /OPENCLAW_MEMORY_QMD_QUERY_TIMEOUT_MS=120000/);
  assert.match(envRailway, /OPENCLAW_MEMORY_QMD_QUERY_TIMEOUT_MS=120000/);
  assert.match(envExample, /OPENCLAW_MEMORY_QMD_WARMUP_QUERY=Alma verification note/);
  assert.match(envRailway, /OPENCLAW_MEMORY_QMD_WARMUP_QUERY=Alma verification note/);
  assert.match(envExample, /OPENCLAW_MEMORY_SEARCH_STORE_PATH=\/data\/\.openclaw\/memory\/\{agentId\}\.sqlite/);
  assert.match(envRailway, /OPENCLAW_MEMORY_SEARCH_STORE_PATH=\/data\/\.openclaw\/memory\/\{agentId\}\.sqlite/);
});

test("runtime bootstrap seeds the Alma verification note for fresh Railway volumes", () => {
  const bootstrap = fs.readFileSync(new URL("../scripts/runtime-bootstrap.sh", import.meta.url), "utf8");
  assert.match(bootstrap, /railway-alma-verification\.md/);
  assert.match(bootstrap, /Verification query: Alma/);
  assert.match(bootstrap, /QMD_WARMUP_QUERY/);
  assert.match(bootstrap, /workspace-all/);
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

test("workspace qmd file entries index from workspace root with a file pattern", () => {
  const src = fs.readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
  assert.match(
    src,
    /name: `workspace-file-\$\{slug\}`,[\s\S]*path: WORKSPACE_DIR,[\s\S]*pattern: entry\.name,/,
  );
  assert.doesNotMatch(
    src,
    /name: `workspace-file-\$\{slug\}`,[\s\S]*path: entryPath,[\s\S]*\}/,
  );
});
