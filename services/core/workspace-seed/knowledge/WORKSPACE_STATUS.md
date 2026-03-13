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
- Preserved provider access should include OpenAI Codex when available
- Memory backend: `qmd`
- Memory search: local embeddings with persistent store
- Gateway: token auth on loopback behind Railway wrapper
- Outbound email: `Resend`

## Current agent operating constraints

- Nate does not have CLI access for OpenClaw administration.
- OpenClaw mutations must go through the dedicated control-plane skill and script-backed changes.
- Historical deployment notes remain useful evidence but are not source of truth until reflected in system docs.

## Current risks to watch

1. Re-onboarding can accidentally narrow provider auth if config persistence is not audited.
2. Historical Stalwart notes can cause email-stack hallucinations if not archived or superseded.
3. OpenClaw runtime changes can drift from docs if the control-plane skill is not updated.
