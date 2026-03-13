---
title: OpenClaw Memory and QMD Bible
updated_at_utc: 2026-03-13T00:00:00Z
system: openclaw
authority: workspace source of truth
---

# OpenClaw Memory and QMD Bible

This file defines the active retrieval policy for this workspace.

## Current operating mode

- OpenClaw `memorySearch` is disabled for the default agent.
- Direct QMD is the supported retrieval path for workspace markdowns.
- QMD state lives under `/data/.openclaw/agents/main/qmd/`.
- The direct QMD collection name is `workspace`.
- The direct QMD collection root is `/data/workspace` with mask `**/*.md`.

## Lookup order

1. `python3 skills/qmd-retrieval/scripts/qmd_memory_search.py --query "..."`
2. `python3 skills/qmd-retrieval/scripts/qmd_memory_get.py --path <relative-md-path>`
3. Local file inspection
4. Web research when local evidence is missing or stale
5. Writeback to `references/`, then durable docs in `knowledge/`, `patterns/`, or `memory/system/`

## Heartbeat and indexing

- Heartbeat runs every 4 hours.
- Heartbeat calls `bash tools/admin/qmd-rescan.sh`.
- `qmd-rescan.sh` ensures the `workspace` collection exists and uses the managed QMD XDG state.
- `qmd update` runs without force flags so refresh stays incremental unless QMD detects changed content.
- If the last successful rescan is newer than 4 hours, the script skips instead of re-running.

## Do not do this

- Do not use `openclaw memory search`, `openclaw memory index`, or `memory_search` as the default retrieval path here.
- Do not mutate `memory.qmd.*` from heartbeat.
- Do not assume Anthropic is an automatic model fallback.

## Verification anchors

- `openclaw config get agents.defaults.memorySearch.enabled --json`
- `bash tools/admin/qmd-rescan.sh`
- `python3 skills/qmd-retrieval/scripts/qmd_memory_search.py --query "OpenClaw" --max-results 5`
- `python3 skills/qmd-retrieval/scripts/qmd_memory_get.py --path memory/system/openclaw-configuration-bible.md --from 1 --lines 40`
