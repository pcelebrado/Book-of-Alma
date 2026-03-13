# HEARTBEAT.md

## Scope Boundary
This file owns heartbeat-lane behavior only. Do not place general non-heartbeat governance here.

Heartbeat is active in **lean mode** (context-protective).
Cadence is **every 4 hours** (`agents.defaults.heartbeat.every: "4h"`).
Run `python3 tools/heartbeat/append_heartbeat_log.py 0` now.

## Purpose
Keep the runtime healthy without bloating active context.

## Required heartbeat flow (strict)
1. Run `python3 tools/heartbeat/append_heartbeat_log.py 0`.
2. Run `session_status` once at start.
3. Extract context window from the status line and run `python3 tools/heartbeat/append_heartbeat_log.py 1 --context-window "<value>"`.
4. Run `openclaw logs --limit 80 --plain`.
5. Run `python3 tools/heartbeat/append_heartbeat_log.py 2 --context-window "<value>"`.
6. Check only today's memory note: `memory/YYYY-MM-DD.md`.
7. Run `python3 tools/heartbeat/append_heartbeat_log.py 3 --context-window "<value>"`.
8. Run `bash tools/admin/qmd-rescan.sh`.
9. Run `python3 tools/heartbeat/append_heartbeat_log.py 5 --context-window "<value>"`.
10. If there is no urgent signal, reply `HEARTBEAT_OK` and stop.
11. If urgent signal exists, report a compact alert with evidence and stop.

## QMD maintenance rules
- `bash tools/admin/qmd-rescan.sh` is the only approved QMD maintenance command for heartbeat.
- The script uses the managed QMD XDG state under `/data/.openclaw/agents/main/qmd`.
- The script ensures the `workspace` collection exists for `/data/workspace` with `**/*.md`.
- The script uses plain `qmd update`, not force flags, and skips when the last successful rescan is newer than 4 hours.

## Retrieval order
1. QMD via `skills/qmd-retrieval/`
2. Local directory and file inspection
3. Web research when local evidence is missing or stale
4. Writeback to `references/`, then durable docs in `knowledge/`, `patterns/`, or `memory/system/`

## Remediation policy
- No automated gateway, provider, or OpenClaw config remediation from heartbeat.
- Heartbeat may only report runtime issues and keep QMD fresh through the approved rescan script.
- Never use `openclaw memory search`, `openclaw memory index`, or `openclaw doctor` from heartbeat.

## Hard guardrails
- Never run from heartbeat: `openclaw doctor`, `openclaw gateway start|stop|restart`.
- Never mutate provider auth, model routing, or `memory.qmd.*` from heartbeat.
- Never re-enable OpenClaw `memorySearch` from heartbeat.
- If context usage is high, heartbeat must de-scope to report-only behavior.

## Logging + writeback
- Heartbeat must append notable incidents to:
  - `knowledge/heartbeat/`
  - `patterns/` when a repeatable fix pattern is proven
  - `references/` for external source material used in a remediation
- Diagnostic context audit file is `data/heartbeat_logs.json`.

## Response rule
- Nothing urgent: `HEARTBEAT_OK`
- Action needed: alert text only
