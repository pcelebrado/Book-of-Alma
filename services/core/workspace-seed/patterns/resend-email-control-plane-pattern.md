# Pattern: Resend Email Control Plane

Use Resend as the canonical outbound email system for this workspace.

## Rules

1. Prefer `skills/email-api/` for outbound email operations.
2. Treat Stalwart material as archived history, not active policy.
3. Update `memory/system/email-control-plane-bible.md` if the email control plane changes.

## Why

- A single current email control plane reduces hallucinations.
- Resend is the currently validated and approved path.
