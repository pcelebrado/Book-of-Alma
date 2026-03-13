# Pattern: Direct QMD Retrieval Wrapper

## Goal

Use direct QMD as the default recall engine for workspace markdowns when OpenClaw `memorySearch` is disabled.

## Contract

- Search wrapper returns JSON:
  - `results[]`: `path`, `startLine`, `endLine`, `score`, `snippet`, `citation`
  - top-level: `provider`, `citations`
- Get wrapper returns JSON:
  - `path`, `from`, `lines`, `content`, `citation`

## Managed state

- QMD state must use `/data/.openclaw/agents/main/qmd/xdg-config` and `/data/.openclaw/agents/main/qmd/xdg-cache`.
- The active collection is `workspace`.
- The collection root is `/data/workspace` with `**/*.md`.

## Retrieval order

1. QMD wrapper
2. Local file inspection
3. Web research
4. Writeback to `references/` plus durable docs

## Reliability notes

- Run `bash tools/admin/qmd-rescan.sh` before retrieval when freshness matters.
- `qmd update` is used without force flags so rescan remains incremental.
- If QMD results are empty or weak, escalate instead of inventing an answer.
