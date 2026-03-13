# Railway Workspace Migration

This template now treats the Railway volume at `/data` as the only durable source of truth:

- OpenClaw state: `/data/.openclaw`
- Active workspace path seen by OpenClaw: `/data/workspace`
- Compatibility workspace path: `/root/.openclaw/workspace` -> `/data/workspace`
- SFTPGo transfer root: `/data/workspace`

## One-time migration for existing deployments

1. Snapshot the current deployment before changing anything:

```bash
openclaw status --all
tar -czf /tmp/openclaw-pre-migration.tgz -C /data .openclaw workspace 2>/dev/null
```

2. Update Railway variables for `openclaw-core`:

```text
OPENCLAW_STATE_DIR=/data/.openclaw
OPENCLAW_CLAUDE_STATE_DIR=/data/.claude
OPENCLAW_WORKSPACE_DIR=/data/workspace
OPENCLAW_WORKSPACE_VOLUME_DIR=/data/workspace
OPENCLAW_CLAUDE_CLI_COMMAND=claude
OPENCLAW_CLAUDE_MAX_PROXY_COMMAND=claude-max-api
OPENCLAW_CLAUDE_MAX_PROXY_HOST=127.0.0.1
OPENCLAW_CLAUDE_MAX_PROXY_PORT=3456
OPENCLAW_CLAUDE_MAX_PROXY_BASE_URL=http://127.0.0.1:3456/v1
OPENCLAW_CLAUDE_MAX_PROXY_PROVIDER_ID=claude-max
OPENCLAW_CLAUDE_MAX_PROXY_DEFAULT_MODEL=claude-opus-4
OPENCLAW_DEFAULT_MODEL_PRIMARY=kimi-coding/k2p5
OPENCLAW_DEFAULT_MODEL_FALLBACKS=openai-codex/gpt-5.3-codex
OPENCLAW_HEARTBEAT_EVERY=4h
OPENCLAW_HEARTBEAT_TARGET=none
SFTPGO_PORTABLE_DIRECTORY=/data/workspace
OPENCLAW_MEMORY_BACKEND=qmd
OPENCLAW_MEMORY_QMD_COMMAND=/root/.bun/install/global/node_modules/@tobilu/qmd/bin/qmd
OPENCLAW_MEMORY_QMD_INCLUDE_DEFAULT_MEMORY=false
OPENCLAW_MEMORY_QMD_UPDATE_INTERVAL=5m
OPENCLAW_MEMORY_QMD_INDEX_WORKSPACE=true
OPENCLAW_MEMORY_QMD_WORKSPACE_PATTERN=**/*.md
OPENCLAW_MEMORY_QMD_WAIT_FOR_BOOT_SYNC=false
OPENCLAW_MEMORY_QMD_QUERY_TIMEOUT_MS=120000
OPENCLAW_MEMORY_QMD_COMMAND_TIMEOUT_MS=120000
OPENCLAW_MEMORY_QMD_UPDATE_TIMEOUT_MS=60000
OPENCLAW_MEMORY_QMD_EMBED_TIMEOUT_MS=300000
OPENCLAW_QMD_RESCAN_MIN_INTERVAL_SECONDS=14400
OPENCLAW_QMD_WARM_ON_BOOT=false
OPENCLAW_MEMORY_WARMUP_ENABLED=false
OPENCLAW_MEMORY_QMD_WARMUP_QUERY=test
OPENCLAW_MEMORY_WARMUP_TIMEOUT_MS=300000
OPENCLAW_CONTROL_UI_ALLOW_INSECURE_AUTH=true
OPENCLAW_MEMORY_SEARCH_ENABLED=false
OPENCLAW_MEMORY_SEARCH_PROVIDER=local
OPENCLAW_MEMORY_SEARCH_FALLBACK=none
OPENCLAW_MEMORY_SEARCH_LOCAL_MODEL_PATH=hf:ggml-org/embeddinggemma-300m-qat-q8_0-GGUF/embeddinggemma-300m-qat-Q8_0.gguf
OPENCLAW_MEMORY_SEARCH_LOCAL_MODEL_CACHE_DIR=/data/.openclaw/models/node-llama-cpp
OPENCLAW_MEMORY_SEARCH_STORE_PATH=/data/.openclaw/memory/{agentId}.sqlite
```

3. Redeploy the service.

Default Railway runtime strategy:

- Kimi stays the primary model and Codex is the automatic fallback.
- Anthropic remains available for explicit task selection, not as the default fallback chain.
- Heartbeat is fixed at `every: 4h` with `target: none`.
- QMD remains configured on the workspace via `memory.qmd.paths`.
- OpenClaw's derived default-memory roots are disabled on Railway because QMD `2.0.x` treats collection roots as directories and will fail on a file-rooted `MEMORY.md` collection.
- OpenClaw `memorySearch` is disabled by default.
- Direct QMD wrappers under `skills/qmd-retrieval/` are the supported recall path.
- `tools/admin/qmd-rescan.sh` keeps refresh incremental with `qmd update` only and skips if the last successful run is still fresh.
- The wrapper clears `BUN_INSTALL` and pins `OPENCLAW_MEMORY_QMD_COMMAND` to the direct `@tobilu/qmd` entrypoint on Railway.
- The current image is pinned to OpenClaw `v2026.2.9`, which does not accept `memory.qmd.searchMode`; startup scrubs that key automatically if a bad deploy wrote it.
- The local embedding settings stay in the template only as scaffolding if you intentionally re-enable OpenClaw `memorySearch`.

4. On first boot the startup script will:

- create `/data/workspace` and `/data/.openclaw`
- create `/data/.claude` and re-link `/root/.claude` there for Claude Code CLI persistence
- migrate or back up any non-symlink `/root/.openclaw/workspace`
- migrate or back up any transient `/workspace`
- ensure `/root/.openclaw/workspace -> /data/workspace`
- seed `MEMORY.md` and `memory/YYYY-MM-DD.md` if missing
- keep `memory.qmd.includeDefaultMemory=false` so QMD binds `/data/workspace` as the collection root instead of `/data/workspace/MEMORY.md`
- remove the legacy `memory/railway-alma-verification.md` seed if it exists on an older volume
- set Kimi primary with Codex fallback and a 4-hour heartbeat cadence
- disable OpenClaw `memorySearch` for the default agent
- reconcile `auth.profiles` from the persisted main-agent auth store and config backups so re-onboarding does not silently drop older providers
- sync the managed OpenClaw control-plane skill and source-of-truth docs into `/data/workspace`
- sync the managed direct-QMD retrieval skill, heartbeat policy, and QMD maintenance wrapper into `/data/workspace`
- archive stale Stalwart email notes so Resend remains the active email control plane
- auto-start `claude-max-api` whenever `models.providers.claude-max` is configured

5. Run the verifier:

```bash
bash /app/scripts/post-deploy-verify.sh
```

That verifier proves the live runtime shape:

```bash
openclaw status
openclaw models status --json
openclaw config get agents.defaults.memorySearch.enabled --json
openclaw config get agents.defaults.heartbeat --json
bash /data/workspace/tools/admin/qmd-rescan.sh
python3 /data/workspace/skills/qmd-retrieval/scripts/qmd_memory_search.py --query "OpenClaw" --max-results 5
```

## Recovery and restore

Restore into the configured workspace and state directories:

```bash
tar -xzf /tmp/openclaw-pre-migration.tgz -C /data
bash /app/scripts/runtime-bootstrap.sh prepare
bash /app/scripts/post-deploy-verify.sh
```

If you use SFTPGo for workspace transfer, upload into `/data/workspace` only.

## Rollback

If the new layout must be reverted:

1. Stop writes and capture a fresh `/data` backup.
2. Reset Railway variables:

```text
OPENCLAW_WORKSPACE_DIR=/root/.openclaw/workspace
SFTPGO_PORTABLE_DIRECTORY=/data/workspace
OPENCLAW_MEMORY_SEARCH_ENABLED=
```

3. Remove the symlink and recreate the old direct path only after copying data:

```bash
rm -f /root/.openclaw/workspace
mkdir -p /data/workspace
```

4. Redeploy the previous template revision.

Rollback is not recommended unless the previous image is also restored, because
the new template intentionally assumes `/data/workspace` is the active path and
keeps `/root/.openclaw/workspace` only as a compatibility link.
