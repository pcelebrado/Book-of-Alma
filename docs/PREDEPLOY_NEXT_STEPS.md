# OpenClaw Template Predeploy Next Steps

This file captures a full-scope predeploy audit and the deterministic next steps
to deploy without committing secrets.

## Architecture (Free Plan)

Two Railway services with persistent volumes on both services.
Railway auto-detects both from the npm workspace `package.json` at repo root.

| Service | Package Dir | Builder | Public | Volume |
|---------|------------|---------|--------|--------|
| `openclaw-web` | `services/web` | Dockerfile | ✅ Yes | `/data` (SQLite persistence) |
| `openclaw-core` | `services/core` | Dockerfile | ❌ No | `/data` (500MB) |

The `core` service runs OpenClaw, QMD, and SFTPGo.
The `web` service uses SQLite at `/data/web.db` for application data.

## Secrets wiring map (Railway Variables)

Set these values in Railway Variables (service-level), not in git.

### Shared secrets (recommended single source)

- `OC_INTERNAL_SERVICE_TOKEN`
- `OC_SETUP_PASSWORD`
- `OC_GATEWAY_TOKEN` (optional but recommended)
- `OC_AUTH_SECRET`

### web service variables

- `SQLITE_DB_PATH=/data/web.db`
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
  - `BOOK_IMPORT_ENABLED`
  - `BOOK_IMPORT_DRY_RUN`

### core service variables

- `INTERNAL_SERVICE_TOKEN` -> set from `OC_INTERNAL_SERVICE_TOKEN`
- `SETUP_PASSWORD` -> set from `OC_SETUP_PASSWORD`
- `OPENCLAW_GATEWAY_TOKEN` -> set from `OC_GATEWAY_TOKEN` (recommended)
- `OPENCLAW_STATE_DIR=/data/.openclaw`
- `OPENCLAW_WORKSPACE_DIR=/data/workspace`
- `OPENCLAW_WORKSPACE_VOLUME_DIR=/data/workspace`
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
  - `BOOK_IMPORT_ENABLED`
  - `BOOK_IMPORT_DRY_RUN`
- Embedded SFTPGo (auto-configured, credentials MUST be set in Railway Variables):
  - `SFTPGO_ENABLED=true`
  - `SFTPGO_DEFAULT_ADMIN_USERNAME` — **set in Railway dashboard**
  - `SFTPGO_DEFAULT_ADMIN_PASSWORD` — **set in Railway dashboard**
  - `SFTPGO_DATA_ROOT=/data/sftpgo`
  - `SFTPGO_SFTPD__BINDINGS__0__PORT=2022`
  - `SFTPGO_HTTPD__BINDINGS__0__PORT=2080`
  - `SFTPGO_PORTABLE_DIRECTORY=/data/workspace`
  - `SFTPGO_PORTABLE_USERNAME` / `SFTPGO_PORTABLE_PASSWORD` — optional overrides; if blank, portable mode reuses the admin credentials
- Memory search (auto-configured):
  - `OPENAI_API_KEY` — preferred remote embedding provider when present
  - `OPENCLAW_MEMORY_SEARCH_PROVIDER` — optional explicit override (`openai`, `gemini`, `voyage`, `local`)
  - `OPENCLAW_MEMORY_SEARCH_LOCAL_MODEL_PATH=hf:ggml-org/embeddinggemma-300m-qat-q8_0-GGUF/embeddinggemma-300m-qat-Q8_0.gguf`
  - `OPENCLAW_MEMORY_SEARCH_LOCAL_MODEL_CACHE_DIR=/data/.openclaw/models/node-llama-cpp`

## Deterministic next steps before deployment

### Step 0 — Import the repo (auto-detects services)

1. Go to [railway.com/new](https://railway.com/new) → Deploy from GitHub repo.
2. Select `pcelebrado/Book-of-Openclaw` (branch: `mvp`).
3. Railway auto-detects the npm workspace monorepo and stages two services:
   `openclaw-web` (from `services/web`) and `openclaw-core` (from `services/core`).
4. Each service auto-inherits its `railway.toml` config (builder, healthcheck, watch paths, variables).

### Step 1 — Dashboard configuration

1. **Core service → Volumes**: Add volume with mount path `/data` (500MB).
2. **Web service → Volumes**: Add volume with mount path `/data` (for SQLite persistence).
3. **Core service → Networking**: Enable TCP Proxy on port `2022` (for external SFTP access).
4. **Core service → Networking**: Ensure NO public domain is generated (internal only).
5. **Web service → Networking**: Generate a public domain (or add your custom domain).

### Step 2 — Set secrets in Railway Variables

5. Populate Railway Variables using the map above (no plaintext secrets in repo files).
6. Most core config variables are pre-set via `railway.toml` `[variables]` section.
   Only secrets (`INTERNAL_SERVICE_TOKEN`, `SETUP_PASSWORD`, `SFTPGO_DEFAULT_ADMIN_*`, `AUTH_SECRET`) need manual entry.

### Step 3 — Deploy and verify

7. Deploy `core` first.
8. Deploy `web`; verify `/api/health` plus sqlite/core connectivity checks.
9. Confirm cross-service auth (`INTERNAL_SERVICE_TOKEN`) and gateway token consistency.
10. Set book ingest mode (`BOOK_SOURCE_MODE`) and verify chosen source path.
11. Run post-deploy smoke: `web /`, `web /api/health`, `core /setup/healthz` (internal), book endpoints.

## Volume budget (500MB free plan)

| Path | Purpose | Estimated Size |
|------|---------|---------------|
| `/data/log` | SFTPGo logs | ~5-10MB |
| `/data/.openclaw` | OpenClaw config, credentials, tokens | ~1MB |
| `/data/workspace` | OpenClaw workspace (skills, plugins) | ~10-50MB |
| `/data/book-source` | Staged book content for import | ~10-100MB |
| `/data/npm`, `/data/pnpm` | Persistent tool installs | ~10-50MB |
| `/data/sftpgo` | SFTPGo state, host keys, user DB | ~5-10MB |
| **Total** | | **~50-220MB** |

> Keep content imports small. For large books, import only the active sections.
> SQLite durability depends on the web service `/data` volume being attached.

## SFTPGo (embedded in core)

SFTPGo runs inside the core container for book content upload via SFTP.

**Ports:**
- SFTP: port `2022` — enable **TCP Proxy** in Railway dashboard → Settings → Networking
- Web Admin: port `2080` — internal only (reachable via private networking or Railway shell)

**Required Railway Variables (set in dashboard, not git):**
- `SFTPGO_DEFAULT_ADMIN_USERNAME` — admin login for web UI
- `SFTPGO_DEFAULT_ADMIN_PASSWORD` — strong password for admin

**First-time setup:**
1. Deploy the core service
2. In Railway dashboard: core service → Settings → Networking → TCP Proxy → port `2022`
3. Railway gives you `roundhouse.proxy.rlwy.net:XXXXX` — that's your SFTP endpoint
4. Connect: `sftp -P XXXXX your-admin-user@roundhouse.proxy.rlwy.net`
5. Upload workspace content to `/data/workspace`
6. Create an SFTPGo user via web admin (port 2080 internally) with home dir `/data/workspace`

**Disable SFTPGo:** Set `SFTPGO_ENABLED=false` in Railway Variables.

## Other integrations

- QMD is consumed through OpenClaw core runtime behavior; data persists on the volume.
