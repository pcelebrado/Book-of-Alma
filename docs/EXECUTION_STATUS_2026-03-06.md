# Execution Status - 2026-03-06

## Scope

This note captures what was implemented and verified during the current
OpenClaw + Book template stabilization pass.

## Completed

- OpenClaw core wrapper hardening landed:
  - gateway desired-state tracking
  - bounded restart loop
  - gateway output tail diagnostics in debug payloads
- OpenClaw control-plane auth path hardening landed for proxied dashboard traffic.
- Railway split-service operator tooling landed:
  - `tools/railway-ops.mjs`
  - root scripts: `ops:core:*` and `ops:web:*` in `package.json`
- SFTP resilience landed in core entrypoint:
  - full `sftpgo serve` attempt
  - automatic fallback to `sftpgo portable` for upload continuity
- Web service wiring hardening landed:
  - core wake + retry path in `services/web/src/lib/core-client.ts`
  - Mongo connect retry + wake probe in `services/web/src/lib/db/mongo.ts`
  - health endpoint now checks core reachability (not only config presence)

## Key commits (recent)

- `dcf27c3` feat(ops): add explicit railway service tooling and sftp fallback
- `8abe743` fix(web): harden core and mongo cold-start wiring
- `9e66ddf` fix(web): use valid security event name for wake probe
- `9241783` fix(web): guard core response initialization path
- `bee2d77` fix(deploy): revert port env overrides breaking healthchecks

## Current runtime findings

- Book web domain is separate from core domain.
  - Core domain serves OpenClaw control surfaces (`/setup`, `/admin`).
  - Web domain serves Book UI (`/login`, `/book`, `/admin`).
- SFTP endpoint provisioned via Railway TCP proxy:
  - `maglev.proxy.rlwy.net:21721`
- Core and web have both seen healthcheck-fail deployment cycles; latest rollback
  commit (`bee2d77`) removes the recent port override regression.

## Known-good operational commands

From repository root:

```bash
npm run ops:core:status
npm run ops:web:status
npm run ops:core:deploys
npm run ops:web:deploys
npm run ops:core:logs
npm run ops:web:logs
npm run ops:core:ssh -- "openclaw status --all"
npm run ops:web:ssh -- "ls -la /app"
```

## Next deterministic steps

1. Redeploy `openclaw-core` and `openclaw-web` on commit `bee2d77`.
2. Verify health checks pass for both services.
3. Verify web app health endpoint:
   - `GET /api/health` returns `status: ok` and non-unreachable dependencies.
4. Verify book path end-to-end:
   - `/login` -> authenticated session -> `/book`
5. Validate SFTP upload path against TCP proxy endpoint and reindex flow.

## File references touched this pass

- `services/core/src/server.js`
- `services/core/scripts/entrypoint.sh`
- `services/web/src/lib/core-client.ts`
- `services/web/src/lib/db/mongo.ts`
- `services/web/src/lib/env.ts`
- `services/web/src/app/api/health/route.ts`
- `tools/railway-ops.mjs`
- `README.md`
- `docs/service-architecture.md`
