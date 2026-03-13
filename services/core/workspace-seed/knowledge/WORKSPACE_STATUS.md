# Workspace Status

**Agent:** Alma  
**Last verified:** 2026-03-12  
**Prepared by:** Remote operator audit

---

## Source of Truth

These files are authoritative for current system behavior:

- `memory/system/openclaw-configuration-bible.md`
- `memory/system/email-control-plane-bible.md`
- `knowledge/WORKSPACE_STATUS.md`
- `skills/openclaw-control-plane/`
- `/data/.openclaw/openclaw.json`

## Current runtime shape

- Primary model: `kimi-coding/k2p5`
- Default fallback: `openai-codex/gpt-5.3-codex`
- Preserved provider access should include OpenAI Codex and Anthropic when available
- Memory backend: `qmd`
- OpenClaw `memorySearch`: disabled
- Direct retrieval: `skills/qmd-retrieval/`
- Direct retrieval flow: `bash tools/admin/qmd-rescan.sh` -> `python3 skills/qmd-retrieval/scripts/qmd_memory_search.py --query "..."`
- Heartbeat cadence: `4h`
- Gateway: token auth on loopback behind Railway wrapper
- Outbound email: `Resend`

## Current agent operating constraints

- Nate does not have CLI access for OpenClaw administration.
- OpenClaw mutations must go through the dedicated control-plane skill and script-backed changes.
- Historical deployment notes remain useful evidence but are not source of truth until reflected in system docs.

## Current risks to watch

1. Re-onboarding can accidentally narrow provider auth if config persistence is not audited.
2. Historical Stalwart notes can cause email-stack hallucinations if not archived or superseded.
3. OpenClaw runtime changes can drift from docs if the control-plane skill and QMD retrieval skill are not updated.
