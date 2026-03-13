---
name: openclaw-control-plane
description: Use when Nate asks about OpenClaw configuration, provider or model selection, Railway runtime behavior, gateway health, auth profiles, memory or QMD settings, or operational governance. Nate does not have CLI access, so prefer the bundled scripts for audits and safe config patches. Any OpenClaw mutation must also update this skill and the source-of-truth docs in memory/system and knowledge.
---

# OpenClaw Control Plane

Use this skill for both questions and changes involving the live OpenClaw system.

## Scope

- Provider and model selection guidance
- Auth profile persistence across onboarding
- Gateway, channels, memory, and QMD configuration
- Railway-hosted OpenClaw runtime behavior
- Source-of-truth governance for OpenClaw operations

## First steps

1. Read `references/source-of-truth.md`.
2. Run:
   - `python3 skills/openclaw-control-plane/scripts/openclaw_admin.py summary`
   - `python3 skills/openclaw-control-plane/scripts/openclaw_admin.py audit-backups`
3. For source-of-truth questions, prefer:
   - `memory/system/openclaw-configuration-bible.md`
   - `memory/system/openclaw-memory-bible.md`
   - `memory/system/email-control-plane-bible.md`
   - `knowledge/WORKSPACE_STATUS.md`
4. Treat archived or historical notes as non-authoritative unless they are explicitly restored by current docs.

## Mutation rules

- Do not hand-edit `/data/.openclaw/openclaw.json`.
- Use `scripts/openclaw_admin.py patch` for config changes so backups are created deterministically.
- Preserve unrelated auth profiles when switching the primary model. Changing the default model is not a reason to delete another provider's auth profile.
- After any OpenClaw mutation, update:
  - this skill when workflow or assumptions change
  - `memory/system/openclaw-configuration-bible.md`
  - the relevant pattern and knowledge writeback

## Provider and model selection policy

- Multiple providers may coexist at the same time.
- Keep auth state separate from model routing decisions.
- Choose the primary model for the current default workflow, not as a destructive replacement for every other provider.
- Preserve operator-verified access to Codex, Kimi, Claude Max, and other configured providers unless the user explicitly wants removal.
- Default model routing for this workspace is `kimi-coding/k2p5` with fallback `openai-codex/gpt-5.3-codex`.
- Anthropic is available for task-specific use, not as the default automatic fallback.
- For weak-reasoning models, provide guardrails:
  - smaller task scope
  - explicit verification steps
  - stronger writeback requirements
  - escalation to a stronger model when reasoning quality matters

## Memory and retrieval policy

- OpenClaw `memorySearch` is disabled for the default agent in this workspace.
- Use `skills/qmd-retrieval/` for whole-workspace markdown retrieval.
- Use `bash tools/admin/qmd-rescan.sh` to refresh the direct QMD index.
- Retrieval order is `QMD -> local directory/file inspection -> web research -> writeback to references/ + durable docs`.

## Common commands

Audit current runtime:

```bash
python3 skills/openclaw-control-plane/scripts/openclaw_admin.py summary
python3 skills/openclaw-control-plane/scripts/openclaw_admin.py audit-backups
```

Apply a safe JSON merge patch with backup:

```bash
python3 skills/openclaw-control-plane/scripts/openclaw_admin.py patch \
  --backup-label preserve-codex \
  --merge-json '{"auth":{"profiles":{"openai-codex:default":{"provider":"openai-codex","mode":"oauth"}}}}'
```

Prefer `--merge-file <path>` for larger patches to avoid shell-quoting errors.

## Output contract

- `State:` what is configured now
- `Risk:` what might break or drift
- `Action:` the smallest safe change or the recommended no-change path
- `Verification:` command or file evidence
- `Writebacks:` which source-of-truth docs were updated
