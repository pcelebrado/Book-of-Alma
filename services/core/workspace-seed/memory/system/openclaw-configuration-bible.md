---
title: OpenClaw Configuration Bible
updated_at_utc: 2026-03-12T00:00:00Z
system: openclaw
authority: workspace source of truth
---

# OpenClaw Configuration Bible

This file is the source of truth for Nate's live OpenClaw runtime on Railway.

## Canonical config and state

- Config file: `/data/.openclaw/openclaw.json`
- Workspace: `/data/workspace`
- State dir: `/data/.openclaw`
- Wrapper repo/runtime source: Railway core service + `services/core/src/server.js`

## Current intended runtime shape

- Default primary model: `kimi-coding/k2p5`
- Default fallback model: `openai-codex/gpt-5.3-codex`
- Additional provider auth should be preserved when available, especially:
  - `openai-codex:default`
  - `anthropic:default`
- Gateway mode: local loopback behind the Railway wrapper
- Gateway auth: token
- Memory backend: `qmd`
- OpenClaw `memorySearch`: disabled
- Direct QMD retrieval: `skills/qmd-retrieval/`
- Heartbeat cadence: `4h`
- Direct QMD collection root: `/data/workspace` with `**/*.md`

## Provider and model governance

- Provider auth persistence is separate from the current primary model.
- Re-onboarding to change the default model must not delete unrelated provider auth profiles.
- Preserve multi-provider capability unless Nate explicitly asks for removal.
- Default fallback should be Codex, not Anthropic, unless Nate explicitly changes policy.
- For provider/model questions, use `skills/openclaw-control-plane/` first.

## Mutation protocol

1. Audit current state:
   - `python3 skills/openclaw-control-plane/scripts/openclaw_admin.py summary`
   - `python3 skills/openclaw-control-plane/scripts/openclaw_admin.py audit-backups`
2. Apply config changes with:
   - `python3 skills/openclaw-control-plane/scripts/openclaw_admin.py patch --merge-json ...`
   - or `python3 skills/openclaw-control-plane/scripts/openclaw_admin.py patch --merge-file <path>`
   - do not merge unsupported pinned keys like `mcpServers` or `memory.qmd.searchMode`; the patch tool should reject them
3. Verify runtime behavior with health, logs, and config evidence.
4. Update:
   - `skills/openclaw-control-plane/`
   - `skills/qmd-retrieval/`
   - this file
   - the relevant pattern
   - a knowledge writeback

## Do not do this

- Do not hand-edit `openclaw.json`
- Do not use historical notes as current policy
- Do not remove auth profiles just because the default model changed
- Do not treat heartbeat as an admin remediation lane
- Do not use OpenClaw `memorySearch` as the default recall path for this workspace

## Verification anchors

- `/setup/healthz`
- `openclaw_admin.py summary`
- `openclaw_admin.py audit-backups`
- `openclaw config get agents.defaults.memorySearch.enabled --json`
- `bash tools/admin/qmd-rescan.sh`
- targeted runtime logs and config reads

## Supersession rules

- Historical Stalwart notes are not authoritative for current email operations.
- Historical deployment notes are evidence only until reflected here or in another source-of-truth system doc.
