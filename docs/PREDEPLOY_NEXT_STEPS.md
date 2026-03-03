# OpenClaw Template Predeploy Next Steps

This file captures a full-scope predeploy audit and the deterministic next steps
to deploy without committing secrets.

## Architecture (Free Plan)

Two Railway services with a single 500MB persistent volume:

| Service | Root Directory | Public | Volume |
|---------|---------------|--------|--------|
| `web` | `services/web` | ✅ Yes | — |
| `core` | `services/core` | ❌ No | `/data` (500MB) |

The `core` service runs OpenClaw, QMD, and an **embedded MongoDB** instance.
All persistent data shares the single Railway volume at `/data`.

## Secrets wiring map (Railway Variables)

Set these values in Railway Variables (service-level), not in git.

### Shared secrets (recommended single source)

- `OC_INTERNAL_SERVICE_TOKEN`
- `OC_SETUP_PASSWORD`
- `OC_GATEWAY_TOKEN` (optional but recommended)
- `OC_AUTH_SECRET`

### web service variables

- `MONGODB_URI=mongodb://core.railway.internal:27017/openclaw`
- `INTERNAL_CORE_BASE_URL=http://core.railway.internal:8080`
- `INTERNAL_SERVICE_TOKEN` -> set from `OC_INTERNAL_SERVICE_TOKEN`
- `AUTH_SECRET` -> set from `OC_AUTH_SECRET`
- `AUTH_URL`
- `NEXT_PUBLIC_APP_URL`
- Optional key mode: `INTERNAL_JWT_SIGNING_KEYS` or `INTERNAL_JWT_SIGNING_KEY`
- Book ingest settings:
  - `BOOK_SOURCE_MODE`
  - `BOOK_SOURCE_DIR`
  - `BOOK_IMPORT_MANIFEST`
  - `BOOK_CANONICAL_COLLECTION`
  - `BOOK_TOC_COLLECTION`
  - `BOOK_IMPORT_ENABLED`
  - `BOOK_IMPORT_DRY_RUN`

### core service variables

- `INTERNAL_SERVICE_TOKEN` -> set from `OC_INTERNAL_SERVICE_TOKEN`
- `SETUP_PASSWORD` -> set from `OC_SETUP_PASSWORD`
- `OPENCLAW_GATEWAY_TOKEN` -> set from `OC_GATEWAY_TOKEN` (recommended)
- `OPENCLAW_STATE_DIR=/data/.openclaw`
- `OPENCLAW_WORKSPACE_DIR=/data/workspace`
- Embedded MongoDB (auto-configured, override only if needed):
  - `MONGO_PORT=27017`
  - `MONGO_BIND_IP=::,0.0.0.0`
  - `MONGODB_URI=mongodb://127.0.0.1:27017/openclaw`
- Optional:
  - `INTERNAL_GATEWAY_HOST`
  - `INTERNAL_GATEWAY_PORT`
  - `OPENCLAW_ENTRY`
  - `OPENCLAW_NODE`
  - `OPENCLAW_CONFIG_PATH`
- Book ingest settings (must stay aligned with web):
  - `BOOK_SOURCE_MODE`
  - `BOOK_SOURCE_DIR`
  - `BOOK_IMPORT_MANIFEST`
  - `BOOK_CANONICAL_COLLECTION`
  - `BOOK_TOC_COLLECTION`
  - `BOOK_IMPORT_ENABLED`
  - `BOOK_IMPORT_DRY_RUN`

## Deterministic next steps before deployment

1. Create two services in Railway (`web`, `core`) with correct root directory paths.
2. Disable Public Networking for `core`; keep Public Networking enabled only for `web`.
3. Attach `/data` volume (500MB) to `core` before first deploy.
4. Populate Railway Variables using the map above (no plaintext secrets in repo files).
5. Deploy `core` first; it starts MongoDB automatically and initializes the replica set.
6. Deploy `web`; verify `/api/health` plus internal connectivity checks.
7. Confirm cross-service auth (`INTERNAL_SERVICE_TOKEN`) and gateway token consistency.
8. Set book ingest mode (`BOOK_SOURCE_MODE`) and verify chosen source path.
9. Run post-deploy smoke: `web /`, `web /api/health`, `core /healthz` (internal), book endpoints.

## Volume budget (500MB free plan)

| Path | Purpose | Estimated Size |
|------|---------|---------------|
| `/data/db` | MongoDB data files | ~50-200MB |
| `/data/log` | MongoDB logs | ~5-10MB |
| `/data/.openclaw` | OpenClaw config, credentials, tokens | ~1MB |
| `/data/workspace` | OpenClaw workspace (skills, plugins) | ~10-50MB |
| `/data/book-source` | Staged book content for import | ~10-100MB |
| `/data/npm`, `/data/pnpm` | Persistent tool installs | ~10-50MB |
| **Total** | | **~100-400MB** |

> Keep content imports small. For large books, import only the active sections.
> MongoDB's WiredTiger cache is capped at 128MB RAM to leave room for Node.js.

## Optional integrations

- SFTPGo scaffold is included in `services/sftpgo/` for SSH/SFTP file ingress.
  On the free plan, SFTPGo would require the same volume — run it only if you
  have a paid plan with multiple volumes.
- QMD is consumed through OpenClaw core runtime behavior; data persists on the volume.
