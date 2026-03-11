# Execution Status - 2026-03-11

## Scope

This note records the direct Railway deployments and live remediations performed
from the local working tree on March 10-11, 2026 for
`codex/railway-state-qmd-remediation`, the later `main` follow-up, and the
Claude Max proxy onboarding rollout.

## How deployments were done

These were not git-triggered deploys. The services were deployed directly from
the local checkout with Railway CLI.

Core uses the repository root as the upload path so Railway picks up
`services/core/railway.toml` and preserves the Dockerfile-based multi-process
service manifest:

```bash
cd C:\P4NTH30N\OP3NF1XER\nate-alma\openclaw-template
railway up . -p 787f73f3-809d-4ba1-8649-880d1acb8dda -e "Reality Check" -s openclaw-core --detach -m "Deploy Claude Max proxy onboarding core"
```

Web was deployed the same way so the hosted admin page changes shipped with the
core runtime changes:

```bash
cd C:\P4NTH30N\OP3NF1XER\nate-alma\openclaw-template
railway up . -p 787f73f3-809d-4ba1-8649-880d1acb8dda -e "Reality Check" -s openclaw-web --detach -m "Deploy Claude Max proxy onboarding web"
```

Running `railway up` from `services/core` without the repo root caused
deployment `6de322a2-d04f-45bb-981f-1fa1189651d8` to fall back to a raw
RAILPACK code snapshot and fail. Using the repo root path restored Railway's
checked-in service manifest detection.

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
| `b1ac0213-af1c-4219-bb15-4927a89babc2` | removed | 2026-03-11 06:49:44 | Commit `e2bdfc0` re-aligns the template with the pinned OpenClaw `v2026.2.9` release by scrubbing unsupported `memory.qmd.searchMode` instead of writing it. |
| `7621eb81-6c00-4ccd-9d96-74f8cb2a93cd` | success | 2026-03-11 08:35:20 | Railway restart requested by the Alma bot so live config changes could apply. After restart, a direct live config hotfix set `memory.qmd.includeDefaultMemory=false` and the gateway reloaded cleanly. |
| `1616726f-3d24-41b5-9ce2-03e5c4575b02` | success | 2026-03-11 13:28:09 | Commit `7c1e450` deployed via repo-root `railway up` and shipped Claude Max API Proxy support into `openclaw-core`, including Claude CLI install, proxy supervision, persisted Claude state under `/data/.claude`, and setup-status reporting for the admin flow. |

## Web deployment chain

| Deployment | Status | Time | Purpose |
|-----------|--------|------|---------|
| `8dbd00e1-0f27-43c0-8912-3e78a21ffef5` | success | 2026-03-10 19:02:55 | Previous active hosted admin deployment before Claude Max onboarding support. |
| `391d3ce0-be13-45b7-b16a-c352a30824be` | success | 2026-03-11 13:28:40 | Commit `7c1e450` deployed via repo-root `railway up` and shipped the hosted admin/onboarding UI updates for the Claude Max proxy preset. |

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
- Corrective template commit `e2bdfc0` is now pushed to `main`, and Railway deploy `b1ac0213-af1c-4219-bb15-4927a89babc2` is the image rollout that should preserve that behavior across future restarts.
- New finding from live config and QMD `2.0.x`: OpenClaw's `includeDefaultMemory=true` derives a file-root collection at `/data/workspace/MEMORY.md`, which QMD rejects with `ENOTDIR`.
- Live remediation applied on March 11, 2026: the running Railway deployment was patched in-place to set `memory.qmd.includeDefaultMemory=false` while keeping `memory.qmd.paths=[{path:\"/data/workspace\",pattern:\"**/*.md\"}]`. Railway detected the config change and restarted the gateway successfully.
- Claude Max API Proxy onboarding support was added in commit `7c1e450` using the official OpenClaw provider pattern:
  - `openclaw-core` installs `@anthropic-ai/claude-code` and `claude-max-api-proxy`
  - runtime bootstrap persists Claude CLI auth state at `/data/.claude`
  - hosted admin setup now offers a `claude-max-proxy` Anthropic auth choice and pre-fills the custom OpenAI-compatible provider fields expected by OpenClaw

## Current live findings

Latest public health probe after the live `includeDefaultMemory=false` hotfix:

```json
{"ok":true}
```

Operational interpretation:

- Memory search is no longer in the original `disabled:true` state due to
  missing embedding config.
- The latest live restart completed cleanly and `/setup/healthz` returned
  `{"ok":true}` after the `includeDefaultMemory=false` hotfix.
- Live shell investigation showed the generic `qmd` launcher path on Railway is
  unreliable under Bun-oriented environment state.
- This repository catch-up commit therefore pins
  `OPENCLAW_MEMORY_QMD_COMMAND=/root/.bun/install/global/node_modules/@tobilu/qmd/bin/qmd`
  for the next deploy instead of relying on `/usr/local/bin/qmd`.
- The active live config now keeps QMD generic for the whole workspace by using
  `/data/workspace` as the collection root and disabling derived default-memory
  roots.
- Current live domains after the Claude Max rollout:
  - `https://openclaw-core-reality-check.up.railway.app/setup/healthz` -> `{"ok":true}`
  - `https://openclaw-web-reality-check.up.railway.app/api/health` -> `{"status":"ok","service":"web",...}`
- Live SSH verification on `openclaw-core` after deploy `1616726f-3d24-41b5-9ce2-03e5c4575b02` confirmed:
  - `/usr/local/bin/claude`
  - `/usr/local/bin/claude-max-api`
  - `/data/.claude` exists and is a directory
- The hosted admin setup/auth endpoints remain protected. An unauthenticated
  request to `/api/admin/openclaw/setup/auth-groups` now returns `401 Not authenticated`,
  which is expected for the web service.

## Files changed for this deployment chain

- `services/core/src/server.js`
- `services/core/scripts/runtime-bootstrap.sh`
- `services/core/scripts/post-deploy-verify.sh`
- `services/core/.env.example`
- `services/core/.env.railway`
- `services/core/README.md`
- `services/core/test/legacy-qmd-config.test.js`
- `services/web/src/app/admin/page.tsx`
- `README.md`
- `MIGRATION.md`
- `VERIFY.md`
- `openclaw-core.json`

## Follow-up still worth doing

1. Re-deploy the template image that hard-codes `OPENCLAW_MEMORY_QMD_INCLUDE_DEFAULT_MEMORY=false`
   so the live hotfix survives future image replacements.
2. Re-run the live in-container verifier and capture the final
   `openclaw memory status` and `openclaw memory search "Railway workspace"`
   outputs into this repo.
