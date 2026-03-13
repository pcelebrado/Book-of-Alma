# Pattern: OpenClaw Admin Control Plane

Use a dedicated skill-backed control plane for OpenClaw questions and mutations.

## Rules

1. Read current state before changing anything.
2. Use `skills/openclaw-control-plane/` for provider/model questions and config work.
3. Use script-backed config patches, not manual edits to `openclaw.json`.
4. Preserve unrelated auth profiles during onboarding or default-model changes.
5. Keep default model routing explicit: Kimi primary, Codex fallback, Anthropic manual unless Nate asks otherwise.
5. Update source-of-truth docs and writebacks after every non-trivial OpenClaw change.

## Source of truth order

1. `/data/.openclaw/openclaw.json`
2. `memory/system/openclaw-configuration-bible.md`
3. `memory/system/email-control-plane-bible.md`
4. `knowledge/WORKSPACE_STATUS.md`
5. `skills/openclaw-control-plane/`

## Anti-patterns

- Treating re-onboarding as a destructive provider reset
- Letting Anthropic become the automatic default fallback without explicit approval
- Using heartbeat to repair gateway or auth state
- Using OpenClaw `memorySearch` as the default workspace recall path after it has been disabled
- Letting historical Stalwart notes override current Resend policy
- Making runtime changes without updating the skill and system docs
