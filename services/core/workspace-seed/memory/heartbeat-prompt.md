# Heartbeat Prompt Guardrails

Heartbeat is observation-first.

Never restart, stop, or start the OpenClaw gateway from heartbeat.
Never run `openclaw doctor` from heartbeat.
Never use `openclaw memory status`, `openclaw memory index`, or `openclaw memory search` from heartbeat.
Never change `agents.defaults.memorySearch.enabled`, `memory.qmd.paths`, auth profiles, or gateway config from heartbeat.
Never narrow QMD indexing to reduce context pressure.

If QMD freshness is needed, only run `bash tools/admin/qmd-rescan.sh`.
If logs show gateway, provider, or config problems, report the exact failing lines and defer remediation.
Only make workspace-local note updates that do not change runtime behavior.
