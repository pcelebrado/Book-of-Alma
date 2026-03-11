# OpenClaw Book Template

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/N_f8ll?referralCode=BEkZzK&utm_medium=integration&utm_source=template&utm_campaign=generic)

> **Give OpenClaw a Book. A topic. Let it become a master, then let it become your Teacher.**

Transform any structured content into an immersive learning environment. Upload your book, documentation, or course material. OpenClaw reads it, understands it, and becomes your personal teaching assistant.

---

## What This Template Does

This Railway template deploys a complete **AI-powered learning platform** in minutes:

1. **Upload your content** — Markdown files, documentation, course materials, or structured books
2. **OpenClaw studies it** — Indexes, analyzes, and builds semantic understanding
3. **Learn interactively** — Read, take notes, build playbooks, and ask your AI teacher anything

**Perfect for:**
- Technical documentation and developer guides
- Online courses and educational content  
- Training materials and onboarding docs
- Research papers and academic texts
- Any structured content you want to master

---

## Architecture at a Glance

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Public Internet                                │
│                              │                                          │
│                              ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                        [web] — Next.js                           │   │
│  │  ┌──────────────┐  ┌──────────────────┐  ┌──────────────────┐   │   │
│  │  │  Left Rail   │  │  Center Content  │  │   Right Rail     │   │   │
│  │  │  (TOC Tree)  │  │  (Reader/Lists)  │  │  (Agent Panel)   │   │   │
│  │  └──────────────┘  └──────────────────┘  └──────────────────┘   │   │
│  │                                                                  │   │
│  │  • Library (Content Index)   • Reader (Section View)            │   │
│  │  • Notes & Highlights        • Playbooks (Draft → Published)    │   │
│  │  • Admin (Status & Reindex)  • Command Palette (⌘K)             │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                          │
│                              ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    [core] — Internal Only                         │   │
│  │                                                                  │   │
│  │  ┌──────────────┐  ┌──────────────────────┐                      │   │
│  │  │   OpenClaw   │  │     QMD Search       │                      │   │
│  │  │  (AI Agent)  │  │  (Semantic Index)    │                      │   │
│  │  └──────────────┘  └──────────────────────┘                      │   │
│  │  ┌──────────────┐                                                │   │
│  │  │   SFTPGo     │  SFTP :2022 (TCP Proxy) + Admin :2080         │   │
│  │  └──────────────┘                                                │   │
│  │                                                                  │   │
│  │  Core Railway volume: /data (500MB)                              │   │
│  │  • /data/.openclaw      • /data/workspace                        │   │
│  │  • /data/book-source    • /data/sftpgo                           │   │
│  │  Web Railway volume: /data                                       │   │
│  │  • /data/web.db (SQLite app datastore)                           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

**Two-service architecture (recommended):** use `core` as the OpenClaw runtime/control plane and `web` as the Book UI. In live Railway deployments, `core` is commonly public for OpenClaw operations (`/setup`, `/admin`) while `web` serves book workflows on a separate domain.

---

## The Learning Experience

### Three-Column Sacred Shell

The core layout is a **stable 3-column shell** that remains consistent across all content:

| Column | Width | Purpose |
|--------|-------|---------|
| **Left Rail** | 280px | Table of Contents (Parts → Chapters → Sections) |
| **Center** | 760px max | Reading content, library lists, your notes |
| **Right Rail** | 360px | AI teaching assistant panel |

### Responsive Adaptation

| Breakpoint | Layout |
|------------|--------|
| `≥1536px` (2xl) | Full 3-column |
| `≥1280px` (xl) | 2-column + AI drawer |
| `≥1024px` (lg) | 1-column + TOC drawer + AI drawer |
| `<1024px` | Mobile: full-width sheets |

### Core Pages

1. **Library** (`/book`) — Browse your content collection with reading progress
2. **Reader** (`/book/[...slug]`) — Immersive reading with structured learning blocks
3. **Notes** (`/notes`) — Your personal knowledge base, searchable and filterable
4. **Playbooks** (`/playbooks`) — Draft, refine, and publish your own guides
5. **Admin** (`/admin`) — System status, content reindexing, audit logs
6. **Login** (`/login`) — Secure authentication for your private learning space

### Structured Content Blocks

Every section in the Reader displays (when present):

- **TL;DR** — ≤3 bullet summary of key takeaways
- **Checklist** — ≤5 actionable items to apply what you learned
- **Common Mistakes** — ≤3 pitfalls to avoid
- **Drill** — 1 exercise to reinforce understanding

### AI Teaching Assistant Skills

The right rail exposes **context-aware teaching tools** for whatever you're reading:

1. **Explain/Rephrase** — Simple / Technical / Analogy modes
2. **Socratic Tutor** — 3-5 questions to test your understanding
3. **Flashcards/Quiz** — 5-10 Q&A pairs for spaced repetition
4. **Checklist Builder** — Create procedural guides from content
5. **Scenario Tree Builder** — If/Then decision trees
6. **Notes Assistant** — Create, tag, and link your insights

---

## Quick Start

### 1. Deploy to Railway

Click the **Deploy on Railway** button above to import the repo.

Railway will create a project with the repo attached. Configure
**two services** from it — `openclaw-core` (OpenClaw runtime) and `openclaw-web` (Book UI).

#### Service setup

| Step | Where | Action |
|------|-------|--------|
| 1 | Project canvas | Click the service → Settings → **Root Directory** → `services/core` |
| 2 | Core service → Settings | Set **Healthcheck Path** to `/setup/healthz` |
| 3 | Core service | Right-click → **Attach Volume** → Mount path: `/data` |
| 4 | Core service → Networking | Generate a domain if you want direct OpenClaw ops UI (`/setup`, `/admin`) |
| 5 | Core service → Variables → **Raw Editor** | Paste contents of `services/core/.env.railway` |
| 6 | Core service → Variables | Set `SETUP_PASSWORD` to a strong password you choose |
| 7 | Project canvas | **+ New Service** → GitHub Repo → same repo → Root Directory: `services/web` |
| 8 | Web service → Settings | Set **Healthcheck Path** to `/api/health` |
| 9 | Web service | Right-click → **Attach Volume** → Mount path: `/data` |
| 10 | Web service → Networking | **Generate domain** (public HTTP) |
| 11 | Web service → Variables → **Raw Editor** | Paste contents of `services/web/.env.railway` |

> **Note:** The `.env.railway` files use Railway's `${{...}}` template
> variable syntax. Secrets are auto-generated, service references resolve
> automatically, and public URLs wire themselves to your Railway domain.

### 2. What Gets Configured

| What | How |
|------|-----|
| **SQLite datastore** | Web stores app data in `/data/web.db` on its own volume |
| **Service auth tokens** | Auto-generated via `${{secret(...)}}` and shared between web and core |
| **Auth.js session secret** | Auto-generated (equivalent to `openssl rand -base64 32`) |
| **Public URL wiring** | `AUTH_URL` and `NEXT_PUBLIC_APP_URL` use your Railway domain |
| **SFTPGo admin password** | Auto-generated |
| **Gateway token** | Auto-generated |
| **Data volumes** | Mounted at `/data` on both core and web services |
| **Book content defaults** | Preconfigured for external upload workflow |

### Persistence Model

Core now enforces one durable workspace layout on every boot:

- `/data/.openclaw` stores persistent OpenClaw state
- `/data/workspace` is the configured OpenClaw workspace path
- `/root/.openclaw/workspace` is recreated as a compatibility symlink to `/data/workspace`
- SFTPGo transfers land directly in `/data/workspace`

### 3. After Deploy

1. Wait for both services to build and deploy (core first, then web)
2. Visit `https://your-app.railway.app` — this is your learning platform
3. Open `/onboarding` to create the first admin account, then sign in
4. Open the Core service `/setup` endpoint to configure your AI provider (OpenAI, Anthropic, Google, etc.)
5. Upload your book content via SFTP (enable TCP Proxy on port 2022 in Railway dashboard)
6. Run `bash /app/scripts/post-deploy-verify.sh` in the core container

### URL Surfaces (Important)

- `https://<core-domain>/setup` = OpenClaw setup control plane (provider/channel config)
- `https://<core-domain>/admin` = OpenClaw dashboard/control UI
- `https://<web-domain>/admin` = Book app admin page (if `services/web` is deployed)

If your core domain opens OpenClaw pages at `/setup` and `/admin`, that is expected behavior.

---

## Adding Your Content

### Option 1: SFTP Upload (Easiest)

1. Enable the SFTPGo service
2. Connect via SFTP client (FileZilla, Cyberduck, etc.)
3. Upload your Markdown files and restored workspace assets to `/data/workspace/`
4. Run reindex from Admin panel

SFTP connection profile (core service):

- Host: your core public domain (for example `openclaw-core-production.up.railway.app`)
- Port: `2022` (requires Railway TCP Proxy enabled for core service)
- Username: `SFTPGO_PORTABLE_USERNAME` if set, otherwise `SFTPGO_DEFAULT_ADMIN_USERNAME` (default: `admin`)
- Password: `SFTPGO_PORTABLE_PASSWORD` if set, otherwise `SFTPGO_DEFAULT_ADMIN_PASSWORD`
- Remote directory: `/data/workspace`

If full SFTPGo mode cannot start in the runtime image, core automatically falls
back to `sftpgo portable` so SFTP uploads remain available for testing. Portable
mode is pinned to the configured `OPENCLAW_WORKSPACE_DIR`, which defaults to
`/data/workspace`, so SFTP transfers land in the same directory OpenClaw uses.

### Option 2: Git-based Import

1. Store your content in a Git repository
2. Mount it as a Railway volume at `/data/book-source/`
3. Set `CONTENT_IMPORT_MANIFEST` to point to your manifest.json

### Content Format

Your content should be structured Markdown with YAML frontmatter:

```markdown
---
title: "Your Section Title"
date: "2024-01-15"
part: "Part I: Foundations"
chapter: "Chapter 1: Getting Started"
---

## Your Content Here

Write in Markdown. The AI will index and understand it all.
```

---

## Local Development

### With Railway CLI (Recommended)

Using the Railway CLI gives you access to your Railway environment variables locally:

1. Install the [Railway CLI](https://docs.railway.app/develop/cli#installation)
2. Login with `railway login`
3. Link your local repo: `railway link`
4. Start with Railway environment:

```bash
# Web service (with Railway env vars)
cd services/web
railway run npm run dev

# Open http://localhost:3000
```

### Multi-service Railway Ops (Core + Web)

Use root helper scripts to switch context and SSH each service deterministically:

```bash
# Link local folders to each Railway service
npm run ops:core:link
npm run ops:web:link

# Verify status/domains
npm run ops:core:status
npm run ops:web:status
npm run ops:core:domain
npm run ops:web:domain

# Capture full service snapshots (JSON + logs + SSH probes)
npm run ops:core:snapshot
npm run ops:web:snapshot

# SSH into each service
npm run ops:core:ssh -- "openclaw status --all"
npm run ops:web:ssh -- "ls -la /app"
```

These helpers run Railway commands from the correct service directory so core/web context drift does not hide deployment issues. Snapshot artifacts are written to `logs/railway-snapshots/<timestamp>-<service>/`.

### Without Railway CLI

```bash
# Web service
cd services/web
cp .env.example .env.local   # Edit with your local values
npm install
npm run dev
```

Production build check:
```bash
cd services/web
npm run build
```

### Container Build Checks

```bash
# Web (from the web service directory)
cd services/web
docker build -t openclaw-web .

# Core (from the core service directory — includes OpenClaw + QMD + SFTPGo)
cd services/core
docker build -t openclaw-core .
```

---

## Design Philosophy

This template implements the **"Calm Research UI"** pattern:

- **Editorial first** — Typography and rhythm carry the design
- **Calm density** — Full but breathable; never cramped
- **Quiet chrome** — Minimal borders, subtle surfaces
- **One accent** — Restrained color for focus and links
- **No empty pages** — Every state has purpose and a next action
- **No silent failure** — Every async action shows status, timestamp, and retry

The goal is **learning, retention, and recall** — not just reading.

---

## API Contracts

### Public Endpoints (Browser → Web)

```
GET  /api/book/toc                    # Table of contents
GET  /api/book/section?slug=...       # Section content
GET  /api/book/search?q=...           # Semantic search

POST /api/notes                       # Create note
GET  /api/notes                       # List notes

POST /api/highlights                  # Create highlight
POST /api/bookmarks/toggle            # Toggle bookmark
POST /api/progress                    # Update reading progress

POST /api/agent/skill                 # Run AI teaching skill

GET  /api/admin/status                # System status (admin)
POST /api/admin/book/reindex          # Trigger reindex (admin)
```

### Internal Endpoints (Web → Core)

```
POST /internal/search                 # QMD semantic search
POST /internal/agent/run              # Execute AI skill
POST /internal/index/rebuild          # Rebuild search index
GET  /internal/index/status           # Index job status
GET  /internal/health                 # Health check
```

All internal endpoints require:
```
Authorization: Bearer <service-token-or-jwt>
X-Request-Id: <uuid>
```

---

## Security & Hardening

### Authentication Layers

1. **User Auth** — Next.js sessions (HTTP-only cookies)
2. **Service Auth** — JWT or shared secret between Web ↔ Core
3. **Mongo Auth** — Embedded in core container (no public exposure, no auth by default on free plan)

### Rate Limits

| Endpoint | Limit |
|----------|-------|
| Login | 5 attempts / 15 min / IP |
| AI skills | 10 / min, 100 / hour / user |
| Search | 30 / min / user |
| Admin actions | 5 / min / admin |

### Security Checklist

- [ ] Only `web` is publicly exposed
- [ ] Web SQLite file persists at `/data/web.db`
- [ ] Core service has no public HTTP
- [ ] Service-to-service auth implemented
- [ ] Rate limiting enabled
- [ ] CORS locked to web domain only
- [ ] Audit logging for admin and AI actions

---

## Operational Commands

### Validation Baseline

```bash
# Core health
openclaw --version
openclaw status
openclaw doctor
qmd --version

# Route probes
curl -i https://<your-domain>/healthz
curl -i https://<your-domain>/setup/api/status
curl -i https://<your-domain>/openclaw

# API spot checks
curl -i https://<your-domain>/api/admin/status
curl -i https://<your-domain>/api/notes?limit=1
```

### Deployment Workflow

```
Probe → Snapshot → Mutate → Verify → Record → Learn
```

### QMD Memory Backend Defaults

Core enables OpenClaw memory via QMD by default (see OpenClaw memory concept docs):

- `OPENCLAW_MEMORY_BACKEND=qmd`
- `OPENCLAW_MEMORY_QMD_COMMAND=/root/.bun/install/global/node_modules/@tobilu/qmd/bin/qmd`
- `OPENCLAW_MEMORY_QMD_UPDATE_INTERVAL=5m`
- `OPENCLAW_MEMORY_QMD_WAIT_FOR_BOOT_SYNC=false`
- `OPENCLAW_MEMORY_QMD_INCLUDE_DEFAULT_MEMORY=true`
- `OPENCLAW_MEMORY_QMD_INDEX_WORKSPACE=true`
- `OPENCLAW_MEMORY_QMD_WORKSPACE_PATTERN=**/*`
- `OPENCLAW_MEMORY_QMD_QUERY_TIMEOUT_MS=15000`
- `OPENCLAW_MEMORY_QMD_UPDATE_TIMEOUT_MS=60000`
- `OPENCLAW_MEMORY_QMD_EMBED_TIMEOUT_MS=300000`
- `OPENCLAW_CONTROL_UI_ALLOW_INSECURE_AUTH=true`
- `OPENCLAW_MEMORY_SEARCH_PROVIDER=local`
- `OPENCLAW_MEMORY_SEARCH_FALLBACK=none`
- `OPENCLAW_MEMORY_SEARCH_LOCAL_MODEL_PATH=hf:ggml-org/embeddinggemma-300m-qat-q8_0-GGUF/embeddinggemma-300m-qat-Q8_0.gguf`
- `OPENCLAW_MEMORY_SEARCH_LOCAL_MODEL_CACHE_DIR=/data/.openclaw/models/node-llama-cpp`
- `OPENCLAW_MEMORY_SEARCH_STORE_PATH=/data/.openclaw/memory/{agentId}.sqlite`

The template also seeds `MEMORY.md`, `memory/YYYY-MM-DD.md`, and
`memory/railway-alma-verification.md`, then warms QMD on boot using the same
XDG directories that OpenClaw uses at runtime.
It also writes `memory.qmd.paths` so QMD indexes the rest of the workspace by
default instead of limiting retrieval to `MEMORY.md` and `memory/*.md`.

The wrapper also sets `memory.qmd.scope.default=allow` so operator-side CLI
checks like `openclaw memory search "Alma"` work from Railway shells without a
chat session key.
It also raises the QMD query/update/embed timeouts for Railway cold starts so
first-run model downloads do not fail memory verification prematurely.
The wrapper and helper scripts clear `BUN_INSTALL` before calling QMD and pin
the command to the direct `@tobilu/qmd` entrypoint so Railway shells do not
depend on the ambient `qmd` launcher state.

Fresh deployments can have a slow first memory query while QMD or the local
embedding model downloads assets. Railway now uses one deterministic memory
search strategy by default:

- provider `local`
- fallback `none`
- model `hf:ggml-org/embeddinggemma-300m-qat-q8_0-GGUF/embeddinggemma-300m-qat-Q8_0.gguf`
- cache dir `/data/.openclaw/models/node-llama-cpp`
- store path `/data/.openclaw/memory/{agentId}.sqlite`
- QMD paths `memory.qmd.paths[]=top-level workspace entries` with pattern `**/*`

`OPENAI_API_KEY`, `GEMINI_API_KEY`, and `VOYAGE_API_KEY` are optional and are
only needed if you intentionally override `OPENCLAW_MEMORY_SEARCH_PROVIDER` to a
remote embedding provider.

See `docs/PREDEPLOY_NEXT_STEPS.md`, [MIGRATION.md](./MIGRATION.md), and
[VERIFY.md](./VERIFY.md) for the full deployment, migration, and verification flow.

---

## Documentation

| Document | Purpose |
|----------|---------|
| `docs/PREDEPLOY_NEXT_STEPS.md` | Deployment checklist and secrets wiring map |
| `docs/EXECUTION_STATUS_2026-03-11.md` | Direct Railway deploy chain, deployment IDs, and current runtime status |
| `docs/SSH_SFTPGO_GO_LIVE.md` | SFTP configuration and go-live checks |
| `services/*/README.md` | Service-specific documentation |
| `services/*/.env.example` | Environment variable templates |

---

## Roadmap: What's Coming

### Always-On AI Teacher
Deploy a persistent AI agent that:
- Monitors your learning progress
- Suggests content based on your notes and playbooks
- Answers questions via Telegram/Discord bot
- Sends daily learning digests

### Multi-Modal Content
- PDF import and automatic Markdown conversion
- Video transcript indexing
- Image and diagram understanding
- Interactive code execution

### Collaborative Learning
- Study groups and shared annotations
- Instructor dashboards for course creators
- Community playbooks and shared insights

### Advanced Personalization
- Learning path recommendations
- Spaced repetition for flashcards
- Knowledge gap analysis
- Adaptive difficulty

---

## License

[License](./LICENSE)

---

## Notes

- All secrets must be configured via Railway Variables — never commit them to git
- The learning philosophy prioritizes **understanding over consumption**

---

<p align="center">
  <em>Give OpenClaw a Book. Let it become your Teacher.</em>
</p>
