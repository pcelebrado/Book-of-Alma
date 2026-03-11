# Execution Status - 2026-03-11

## Scope

This note records the direct Railway deployments performed from the local
working tree on March 10-11, 2026 for `codex/railway-state-qmd-remediation`.

## How deployments were done

These were not git-triggered deploys. The core service was deployed directly
from the local checkout with Railway CLI:

```bash
cd services/core
railway up --service openclaw-core --detach
```

That is why Railway advanced while `origin/codex/railway-state-qmd-remediation`
stayed at `fd3b222` until this documentation/commit pass.

## Core deployment chain

All timestamps below are America/Denver (`-06:00`).

| Deployment | Status | Time | Purpose |
|-----------|--------|------|---------|
| `3c5c01c2-ddff-4bec-a3a8-d41a8cb3b937` | removed | 2026-03-10 22:49:38 | Baseline after initial `memory.qmd.searchMode` removal workaround, insecure auth enablement, and gateway `--force`. |
| `631ce9ef-fb0d-43fe-b16f-0b1abe29efaf` | removed | 2026-03-10 23:34:46 | Explicit local memory search defaults, store/cache path prep, Alma verifier seed, docs/verifier tightening. |
| `eff2227c-6764-4b2b-984a-13f103993c28` | removed | 2026-03-10 23:41:25 | QMD CLI scope widened with `memory.qmd.scope.default=allow`. |
| `dbba54c6-dac4-4d81-8413-31cdfdb60c2e` | removed | 2026-03-10 23:52:46 | QMD query/update/embed timeout increases and verifier retry exit-code fix. |
| `bcab78d7-ad77-403f-8e3f-aed8e95406ac` | removed | 2026-03-11 00:11:33 | Bun env cleanup pass. |
| `db3a7bba-38be-4540-a35f-2de5ddfc1290` | success | 2026-03-11 03:14:55 | OpenClaw-supported QMD command-timeout fix for Railway cold starts. |
| `f774feca-0cff-4ee9-be11-0f4459f76e7e` | success | 2026-03-11 03:49:38 | Commit `b4838ac` removes Alma-specific QMD warmup drift, disables custom warmups by default, and scrubs the legacy Alma verification seed from persisted volumes. |
| `e05bc772-6db0-4277-a376-cf2b26a816bc` | success | 2026-03-11 06:22:51 | Commit `26a48cb` restored `memory.qmd.searchMode=search`, but the image is pinned to OpenClaw `v2026.2.9`, so the live deployment rejected that key and had to be remediated in-place. |

## Implemented during this pass

- Explicit Railway default for `agents.defaults.memorySearch.provider=local`
- Persistent memory search store path under `/data/.openclaw/memory/{agentId}.sqlite`
- QMD CLI scope default forced to `allow` for operator-side verification
- Railway QMD timeout increases for cold starts
- `BUN_INSTALL` clearing in wrapper and scripts to avoid Bun-selected QMD launcher
- Deployment verifier retry exit-code fix
- Docs/env/schema updates reflecting the real Railway runtime contract
- Later correction: Alma-specific verification seed/query were template drift and are being removed in the next deploy
- Explicit Railway vars for the correction deploy: `OPENCLAW_QMD_WARM_ON_BOOT=false`, `OPENCLAW_MEMORY_WARMUP_ENABLED=false`, `OPENCLAW_MEMORY_QMD_WARMUP_QUERY=test`
- New finding from live deploy `e05bc772-6db0-4277-a376-cf2b26a816bc`: the image is pinned to OpenClaw `v2026.2.9`, and that release rejects `memory.qmd.searchMode` as an unknown key even though newer OpenClaw docs/source now support it.
- Live remediation applied on March 11, 2026: `openclaw doctor --fix` removed `memory.qmd.searchMode` from `/data/.openclaw/openclaw.json`, after which the gateway resumed listening on `127.0.0.1:18789`.

## Current live findings

Latest public health probe:

```json
{
  "ok": true,
  "wrapper": {
    "memorySearchProvider": "local",
    "memorySearchSource": "env:OPENCLAW_MEMORY_SEARCH_PROVIDER",
    "memorySearchStorePath": "/data/.openclaw/memory/{agentId}.sqlite",
    "memorySearchWarnings": []
  },
  "gateway": {
    "reachable": false,
    "lastError": "[gateway] start failure: Error: Gateway did not become ready in time"
  }
}
```

Operational interpretation:

- Memory search is no longer in the original `disabled:true` state due to
  missing embedding config.
- The remaining wrapper health issue is the pre-existing false-negative gateway
  readiness check.
- Live shell investigation showed the generic `qmd` launcher path on Railway is
  unreliable under Bun-oriented environment state.
- This repository catch-up commit therefore pins
  `OPENCLAW_MEMORY_QMD_COMMAND=/root/.bun/install/global/node_modules/@tobilu/qmd/bin/qmd`
  for the next deploy instead of relying on `/usr/local/bin/qmd`.

## Files changed for this deployment chain

- `services/core/src/server.js`
- `services/core/scripts/runtime-bootstrap.sh`
- `services/core/scripts/post-deploy-verify.sh`
- `services/core/.env.example`
- `services/core/.env.railway`
- `services/core/README.md`
- `services/core/test/legacy-qmd-config.test.js`
- `README.md`
- `MIGRATION.md`
- `VERIFY.md`
- `openclaw-core.json`

## Follow-up still worth doing

1. Fix the wrapper gateway readiness false-negative so `/healthz` reflects the
   healthy post-boot state.
2. Re-run the live in-container verifier after the current generic-workspace
   cleanup deploy and capture the final `openclaw memory status` and
   `openclaw memory search "Railway workspace"` outputs into this repo.
