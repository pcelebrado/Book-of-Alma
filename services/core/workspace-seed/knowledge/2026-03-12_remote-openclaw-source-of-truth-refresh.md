# 2026-03-12 Remote OpenClaw Source-of-Truth Refresh

## Goal

Reduce hallucinations by aligning live OpenClaw config, provider persistence, email control-plane docs, and agent governance.

## Audit findings

- Live `openclaw.json` matched the plain backup `openclaw.json.bak`.
- Older backups showed `openai-codex:default` persisted before Kimi onboarding.
- Current live config kept Kimi as primary but no longer persisted the older Codex auth profile.
- Workspace docs were split-brain on email:
  - newer material pointed to Resend
  - older pattern and knowledge files still described Stalwart as active

## Changes completed

- Remote config repair restored `openai-codex:default` in the live Railway `openclaw.json` before the template redeploy.
- Added `skills/openclaw-control-plane/` with script-backed audit and patch workflow.
- Refreshed OpenClaw source-of-truth docs in `memory/system/` and `knowledge/`.
- Replaced the active Stalwart operations pattern with a Resend control-plane pattern.
- Updated governance so OpenClaw changes must update the control-plane skill and system docs.
- Restored multi-provider persistence for Codex alongside the Kimi default model.

## Verification targets

- `python skills/openclaw-control-plane/scripts/openclaw_admin.py summary`
- `python skills/openclaw-control-plane/scripts/openclaw_admin.py audit-backups`
- `/setup/healthz`
