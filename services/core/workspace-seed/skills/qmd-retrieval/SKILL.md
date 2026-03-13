---
name: qmd-retrieval
description: Use when recalling project docs, references, decisions, patterns, notes, or system state from markdown files in the workspace with direct QMD wrappers. Use this instead of OpenClaw memory_search here, especially when you need citation-ready snippets across the whole working directory.
---

# QMD Retrieval

Use direct QMD for workspace recall in this repo.

## First steps

1. If freshness matters, run `bash tools/admin/qmd-rescan.sh`.
2. Search with `python3 skills/qmd-retrieval/scripts/qmd_memory_search.py --query "..." --max-results 5 --min-score 0.10`.
3. Read the exact file with `python3 skills/qmd-retrieval/scripts/qmd_memory_get.py --path <relative-md-path> --from 1 --lines 40`.

## Retrieval order

1. QMD
2. Local directory and file inspection
3. Web research
4. Writeback to `references/`, then durable docs in `knowledge/`, `patterns/`, or `memory/system/`

## Scope

- Whole-workspace markdown collection rooted at `/data/workspace`
- Includes `MEMORY.md`, `memory/`, `knowledge/`, `patterns/`, `references/`, `skills/`, and other workspace `.md` files
- Does not replace web research for current external facts

## Guardrails

- Do not use `openclaw memory search` or `openclaw memory index` as the default retrieval path here.
- Keep citations as `path#Lx-Ly`.
- If QMD results are weak or empty, say so and escalate instead of guessing.
