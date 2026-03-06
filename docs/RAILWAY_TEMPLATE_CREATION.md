# Railway Template Creation Guide

> **Why this matters:** A raw GitHub import (`/new/github?repo=...`) creates a
> single service blob with no variables. A **Railway Template**
> (`/new/template/<code>`) shows the "Deploy X — This template deploys N
> services" screen with Configure buttons, pre-populated env vars, volumes,
> and networking — like Strapi's deploy page.

## Prerequisites

- Railway account logged in at [railway.com](https://railway.com)
- GitHub repo `pcelebrado/Book-of-Alma` accessible (grant Railway access to
  private repos under Account → Integrations → GitHub → Edit Scope)

---

## Step 1: Open Template Composer

1. Go to **[railway.com/workspace/templates](https://railway.com/workspace/templates)**
2. Click **"New Template"**

---

## Step 2: Add Service — `openclaw-core`

1. Click **"+ Add New"** (or `CMD+K` → `+ New Service`)
2. Select **GitHub Repo** as source
3. Enter: `https://github.com/pcelebrado/Book-of-Alma`
4. In service **Settings tab**:
   - **Service Name**: `openclaw-core`
   - **Root Directory**: `services/core`
   - **Start Command**: _(leave blank — Dockerfile CMD handles it)_
   - **Healthcheck Path**: `/setup/healthz`
   - **Public Networking**: ❌ OFF (internal only)
5. **Right-click the service** → **Attach Volume**:
   - **Mount Path**: `/data`
6. In service **Variables tab**, add each variable below:

### Core Variables

| Variable | Value | Notes |
|----------|-------|-------|
| `SETUP_PASSWORD` | _(leave empty — user fills this)_ | **User must set this** |
| `INTERNAL_SERVICE_TOKEN` | `${{secret(64, "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")}}` | Auto-generated |
| `OPENCLAW_GATEWAY_TOKEN` | `${{secret(64, "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")}}` | Auto-generated |
| `OPENCLAW_STATE_DIR` | `/data/.openclaw` | |
| `OPENCLAW_WORKSPACE_DIR` | `/data/workspace` | |
| `RAILWAY_RUN_UID` | `0` | Required for volume permissions |
| `MONGO_PORT` | `27017` | |
| `MONGO_BIND_IP` | `::,0.0.0.0` | IPv6+IPv4 for private networking |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/openclaw` | Local to container |
| `SFTPGO_ENABLED` | `true` | |
| `SFTPGO_DATA_ROOT` | `/data/sftpgo` | |
| `SFTPGO_SFTPD__BINDINGS__0__PORT` | `2022` | |
| `SFTPGO_HTTPD__BINDINGS__0__PORT` | `2080` | |
| `SFTPGO_DATA_PROVIDER__CREATE_DEFAULT_ADMIN` | `true` | |
| `SFTPGO_DEFAULT_ADMIN_USERNAME` | `admin` | |
| `SFTPGO_DEFAULT_ADMIN_PASSWORD` | `${{secret(32, "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")}}` | Auto-generated |
| `INTERNAL_GATEWAY_HOST` | `127.0.0.1` | |
| `INTERNAL_GATEWAY_PORT` | `18789` | |
| `OPENCLAW_ENTRY` | `/openclaw/dist/entry.js` | |
| `OPENCLAW_NODE` | `node` | |
| `BOOK_SOURCE_MODE` | `external` | |
| `BOOK_SOURCE_DIR` | `/data/book-source` | |
| `BOOK_IMPORT_MANIFEST` | `/data/book-source/manifest.json` | |
| `BOOK_CANONICAL_COLLECTION` | `book_sections` | |
| `BOOK_TOC_COLLECTION` | `book_toc` | |
| `BOOK_IMPORT_ENABLED` | `false` | |
| `BOOK_IMPORT_DRY_RUN` | `true` | |

---

## Step 3: Add Service — `openclaw-web`

1. Click **"+ Add New"** again
2. Select **GitHub Repo** as source
3. Enter: `https://github.com/pcelebrado/Book-of-Alma`
4. In service **Settings tab**:
   - **Service Name**: `openclaw-web`
   - **Root Directory**: `services/web`
   - **Start Command**: _(leave blank — Dockerfile CMD handles it)_
   - **Healthcheck Path**: `/api/health`
   - **Public Networking**: ✅ ON (HTTP — generate domain)
5. In service **Variables tab**, add each variable below:

### Web Variables

| Variable | Value | Notes |
|----------|-------|-------|
| `NEXT_TELEMETRY_DISABLED` | `1` | |
| `HOSTNAME` | `::` | IPv6 dual-stack |
| `MONGODB_URI` | `mongodb://${{openclaw-core.RAILWAY_PRIVATE_DOMAIN}}:27017/openclaw` | References core service |
| `INTERNAL_CORE_BASE_URL` | `http://${{openclaw-core.RAILWAY_PRIVATE_DOMAIN}}:8080` | References core service |
| `INTERNAL_SERVICE_TOKEN` | `${{openclaw-core.INTERNAL_SERVICE_TOKEN}}` | Shared from core |
| `AUTH_SECRET` | `${{secret(43, "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/")}}=` | Auto-generated |
| `AUTH_URL` | `https://${{RAILWAY_PUBLIC_DOMAIN}}` | Auto-wired to public domain |
| `NEXT_PUBLIC_APP_URL` | `https://${{RAILWAY_PUBLIC_DOMAIN}}` | Auto-wired to public domain |
| `BOOK_SOURCE_MODE` | `external` | |
| `BOOK_SOURCE_DIR` | `/data/book-source` | |
| `BOOK_IMPORT_MANIFEST` | `/data/book-source/manifest.json` | |
| `BOOK_CANONICAL_COLLECTION` | `book_sections` | |
| `BOOK_TOC_COLLECTION` | `book_toc` | |
| `BOOK_IMPORT_ENABLED` | `false` | |
| `BOOK_IMPORT_DRY_RUN` | `true` | |

---

## Step 4: Create Template

1. Click **"Create Template"**
2. You'll be taken to your templates page
3. Copy the **Template URL** — it will look like:
   `https://railway.com/new/template/XXXXXX`

---

## Step 5: Update README Deploy Button

Replace the current deploy button in `README.md` with your template URL:

```markdown
[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new/template/XXXXXX)
```

---

## Step 6 (Optional): Publish to Marketplace

1. Go to [railway.com/workspace/templates](https://railway.com/workspace/templates)
2. Click **"Publish"** next to your template
3. Fill out the form (description, tags, demo project URL)
4. Template becomes discoverable in the Railway marketplace

---

## What the Deployer Will See

After creating the template, anyone clicking the deploy button sees:

```
Deploy OpenClaw Book Template
This template deploys 2 services.

┌──────────────────────────────────────┐
│  openclaw-core                       │
│  pcelebrado/Book-of-Alma             │  [Configure]
│  ✓ Ready to be deployed              │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│  openclaw-web                        │
│  pcelebrado/Book-of-Alma             │  [Configure]
│  ✓ Ready to be deployed              │
└──────────────────────────────────────┘

         [ Deploy ]
```

Clicking **Configure** on either service shows the pre-populated variables
with auto-generated secrets already filled in. The only value the user
**must** set manually is `SETUP_PASSWORD` on the core service.

---

## After Deploy

1. Wait for both services to build (core first, then web)
2. Visit the web service's public URL
3. You'll be redirected to `/setup` for AI provider configuration
4. Set up Telegram/Discord/Slack channels if desired
5. Upload book content via SFTP (enable TCP Proxy on port 2022 in Railway dashboard)
