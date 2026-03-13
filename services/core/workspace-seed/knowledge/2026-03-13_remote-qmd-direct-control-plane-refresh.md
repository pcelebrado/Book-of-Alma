# 2026-03-13 Remote QMD Direct Control-Plane Refresh

Remote operator update for Nate's OpenClaw workspace.

## Goal

Reduce hallucinations by making the runtime and the workspace docs agree on the same provider-routing and retrieval policy.

## Completed remotely

- Set default model routing to `kimi-coding/k2p5` with fallback `openai-codex/gpt-5.3-codex`.
- Preserved Anthropic auth for task-specific use instead of automatic fallback.
- Disabled OpenClaw `memorySearch` for the default agent.
- Promoted direct QMD retrieval as the supported workspace recall path.
- Added a heartbeat-driven QMD rescan workflow that runs on the managed 4-hour cadence and skips when the last successful rescan is already fresh.
- Updated source-of-truth docs, the OpenClaw control-plane skill, and the QMD retrieval skill.

## Lookup order now

1. QMD
2. Local directory and file inspection
3. Web research
4. Writeback to `references/`, then durable docs in `knowledge/`, `patterns/`, or `memory/system/`

## Why this was done

- Kimi remains useful but can time out due to provider-side network instability.
- Codex is the safer default fallback for Nate's workflow.
- OpenClaw's built-in memory lane was still timing out and falling back unpredictably.
- Direct QMD control is easier to verify and easier to document as a source of truth.
