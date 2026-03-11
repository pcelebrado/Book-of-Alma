# Railway Workspace Migration

This template now treats the Railway volume at `/data` as the only durable source of truth:

- OpenClaw state: `/data/.openclaw`
- Physical workspace: `/data/workspace`
- Active workspace path seen by OpenClaw: `/root/.openclaw/workspace` -> `/data/workspace`
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
OPENCLAW_WORKSPACE_DIR=/root/.openclaw/workspace
OPENCLAW_WORKSPACE_VOLUME_DIR=/data/workspace
SFTPGO_PORTABLE_DIRECTORY=/data/workspace
OPENCLAW_MEMORY_BACKEND=qmd
OPENCLAW_MEMORY_QMD_COMMAND=qmd
OPENCLAW_MEMORY_QMD_INCLUDE_DEFAULT_MEMORY=true
OPENCLAW_MEMORY_QMD_UPDATE_INTERVAL=5m
```

3. Redeploy the service.

4. On first boot the startup script will:

- create `/data/workspace` and `/data/.openclaw`
- migrate or back up any non-symlink `/root/.openclaw/workspace`
- migrate or back up any transient `/workspace`
- enforce `/root/.openclaw/workspace -> /data/workspace`
- seed `MEMORY.md` and `memory/YYYY-MM-DD.md` if missing
- best-effort warm QMD against the seeded memory corpus

5. Run the verifier:

```bash
bash /app/scripts/post-deploy-verify.sh
```

## Recovery and restore

Restore into the persistent volume, not the symlink path:

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
OPENCLAW_WORKSPACE_DIR=/data/workspace
```

3. Remove the symlink and recreate the old direct path only after copying data:

```bash
rm -f /root/.openclaw/workspace
mkdir -p /data/workspace
```

4. Redeploy the previous template revision.

Rollback is not recommended unless the previous image is also restored, because
the new template intentionally assumes `/root/.openclaw/workspace` is the active path.
