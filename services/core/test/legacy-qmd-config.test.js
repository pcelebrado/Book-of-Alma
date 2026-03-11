import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("core runtime no longer writes or queries the removed qmd searchMode key", () => {
  const src = fs.readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
  assert.doesNotMatch(src, /OPENCLAW_MEMORY_QMD_SEARCH_MODE/);
  assert.doesNotMatch(src, /config", "get", "memory\.qmd\.searchMode"/);
  assert.match(src, /removeConfigKeys\(\["memory\.qmd\.searchMode"\]\)/);
});

test("template env surfaces no longer expose the removed qmd searchMode setting", () => {
  const envExample = fs.readFileSync(new URL("../.env.example", import.meta.url), "utf8");
  const envRailway = fs.readFileSync(new URL("../.env.railway", import.meta.url), "utf8");

  assert.doesNotMatch(envExample, /OPENCLAW_MEMORY_QMD_SEARCH_MODE/);
  assert.doesNotMatch(envRailway, /OPENCLAW_MEMORY_QMD_SEARCH_MODE/);
});
