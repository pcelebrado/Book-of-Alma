---
title: Email Control Plane Bible
updated_at_utc: 2026-03-12T00:00:00Z
system: email
authority: workspace source of truth
---

# Email Control Plane Bible

## Current truth

- Canonical outbound email provider: `Resend`
- Canonical skill: `skills/email-api/`
- Historical Stalwart experiments are deprecated and must not be used as the operating baseline.

## Why

- Stalwart notes in historical memory created repeated hallucinations about the active mail stack.
- Resend is the current approved control plane for outbound email work in this workspace.

## Operational rules

- For email sending, domain verification, and transactional mail guidance, use `skills/email-api/`.
- Do not reintroduce Stalwart as an active dependency unless Nate explicitly approves a new migration.
- Treat any archived Stalwart knowledge as historical evidence only.

## Documentation rules

- If email architecture changes again, update this file first.
- Then update the relevant skill and the workspace status note.
