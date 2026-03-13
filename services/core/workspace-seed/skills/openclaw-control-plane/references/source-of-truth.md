# OpenClaw Source of Truth

Authoritative files for this workspace:

1. `/data/.openclaw/openclaw.json`
2. `/data/workspace/memory/system/openclaw-configuration-bible.md`
3. `/data/workspace/memory/system/email-control-plane-bible.md`
4. `/data/workspace/knowledge/WORKSPACE_STATUS.md`
5. `/data/workspace/skills/openclaw-control-plane/`

Rules:

- Historical daily notes and old deployment notes are evidence, not policy.
- Archived Stalwart material is not the current email control plane.
- Resend is the canonical outbound email path.
- Kimi may be the current default model without removing Codex or other provider auth.
- OpenClaw changes are incomplete until the skill and system docs are updated.

Current intended runtime shape:

- Primary model: `kimi-coding/k2p5`
- Model fallback: `openai-codex/gpt-5.3-codex`
- Additional provider access: preserve `openai-codex:default` and `anthropic:default` when available
- Memory backend: `qmd`
- OpenClaw `memorySearch`: disabled
- Direct retrieval path: `skills/qmd-retrieval/`
- Heartbeat cadence: `4h`
- Gateway auth: token on loopback behind the Railway wrapper

Question routing:

- Provider/model selection: use `openclaw_admin.py summary` and current auth profiles first
- Config persistence concerns: use `openclaw_admin.py audit-backups`
- Runtime mutation: use `openclaw_admin.py patch`
- Do not introduce unsupported pinned keys like `mcpServers` or `memory.qmd.searchMode`; for `2026.2.9` those must stay absent from the saved config
- Retrieval and memory questions: use `memory/system/openclaw-memory-bible.md` and `skills/qmd-retrieval/`
