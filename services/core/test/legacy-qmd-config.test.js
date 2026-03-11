import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("core runtime no longer writes or queries the removed qmd searchMode key", () => {
  const src = fs.readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
  assert.doesNotMatch(src, /OPENCLAW_MEMORY_QMD_SEARCH_MODE/);
  assert.doesNotMatch(src, /config", "get", "memory\.qmd\.searchMode"/);
  assert.match(src, /removeConfigKeys\(\["memory\.qmd\.searchMode"\]\)/);
});

test("core runtime force-sets control ui insecure auth for hosted Railway webchat", () => {
  const src = fs.readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
  assert.match(src, /OPENCLAW_CONTROL_UI_ALLOW_INSECURE_AUTH/);
  assert.match(src, /gateway\.controlUi\.allowInsecureAuth/);
});

test("template env surfaces no longer expose the removed qmd searchMode setting", () => {
  const envExample = fs.readFileSync(new URL("../.env.example", import.meta.url), "utf8");
  const envRailway = fs.readFileSync(new URL("../.env.railway", import.meta.url), "utf8");

  assert.doesNotMatch(envExample, /OPENCLAW_MEMORY_QMD_SEARCH_MODE/);
  assert.doesNotMatch(envRailway, /OPENCLAW_MEMORY_QMD_SEARCH_MODE/);
  assert.match(envExample, /OPENCLAW_CONTROL_UI_ALLOW_INSECURE_AUTH=true/);
  assert.match(envRailway, /OPENCLAW_CONTROL_UI_ALLOW_INSECURE_AUTH=true/);
});
