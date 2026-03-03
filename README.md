# OpenClaw Railway Template

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new/github?repo=https://github.com/pcelebrado/openclaw-template)

> **Book-first MVP architecture** — A calm, editorial learning environment for structured content with AI-assisted study tools.

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
│  │  • Library (Book Index)      • Reader (Section View)            │   │
│  │  • Notes & Highlights        • Playbooks (Draft → Published)    │   │
│  │  • Admin (Status & Reindex)  • Command Palette (⌘K)             │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                          │
│           ┌──────────────────┼──────────────────┐                      │
│           ▼                  ▼                  ▼                      │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                │
│  │   [core]    │    │   [mongo]   │    │  [sftpgo]   │                │
│  │  (internal) │    │  (internal) │    │  (optional) │                │
│  │             │    │             │    │             │                │
│  │ • OpenClaw  │    │ • Book      │    │ • SSH/SFTP  │                │
│  │ • QMD       │    │ • Notes     │    │ • File      │                │
│  │ • SFTPGo    │    │ • Playbooks │    │   Uploads   │                │
│  └─────────────┘    └─────────────┘    └─────────────┘                │
└─────────────────────────────────────────────────────────────────────────┘
```

**Boundary Rule:** Browsers talk only to `web`. `core` and `mongo` remain private on Railway internal networking.

---

## Design Philosophy

This template implements the **"Calm Research UI"** pattern:

- **Editorial first** — Typography and rhythm carry the design
- **Calm density** — Full but breathable; never cramped
- **Quiet chrome** — Minimal borders, subtle surfaces
- **One accent** — Restrained color for focus and links
- **No empty pages** — Every state has purpose and a next action
- **No silent failure** — Every async action shows status, timestamp, and retry

---

## Service Overview

| Service | Purpose | Exposure | Stack |
|---------|---------|----------|-------|
| `web` | Book UI, Auth, API Routes | **Public** | Next.js 15, Tailwind, shadcn/ui |
| `core` | Agent runtime, Search, Indexing | Internal-only | OpenClaw + QMD + SFTPGo bundle |
| `mongo` | Persistent storage | Internal-only | MongoDB replica set |
| `sftpgo` | File upload interface | Optional public | SFTP/SSH service |

---

## Monorepo Layout

```
openclaw-template/
├── services/
│   ├── web/                    # Next.js Book-first UI
│   │   ├── src/
│   │   │   ├── app/           # App Router (Library, Reader, Notes, Playbooks, Admin)
│   │   │   ├── components/    # shadcn/ui components + custom
│   │   │   ├── lib/           # Mongo client, rate limiting, logger
│   │   │   └── types/         # TypeScript definitions
│   │   └── .env.example
│   │
│   ├── core/                   # OpenClaw runtime container
│   │   ├── Dockerfile
│   │   ├── railway.toml
│   │   └── .env.example
│   │
│   ├── mongo/                  # MongoDB replica set
│   │   ├── nodes/             # Primary MongoDB container
│   │   ├── initService/       # 3-node replica initialization
│   │   └── initServiceSingle/ # Single-node replica initialization
│   │
│   └── sftpgo/                 # Optional SSH/SFTP service
│       ├── Dockerfile
│       ├── startup.sh
│       └── .env.example
│
├── docs/
│   ├── PREDEPLOY_NEXT_STEPS.md      # Deployment checklist
│   └── SSH_SFTPGO_GO_LIVE.md        # SFTP configuration guide
│
├── railway.json               # Railway monorepo configuration
├── LICENSE
└── README.md                  # You are here
```

---

## Quick Start

### 1. Deploy to Railway

Click the **Deploy on Railway** button above or:

```bash
# Clone and push to your own repo
git clone https://github.com/pcelebrado/openclaw-template.git
cd openclaw-template
# ... create your own repo and push ...
```

### 2. Configure Services

Create these Railway services from your repository:

| Service | Root Directory | Config | Public Network | Volumes |
|---------|---------------|--------|----------------|---------|
| `web` | `services/web` | `railway.toml` | ✅ Enabled | — |
| `core` | `services/core` | `railway.toml` | ❌ Disabled | `/data` |
| `mongo` | `services/mongo/nodes` | `Dockerfile` | ❌ Disabled | — |
| `sftpgo` (optional) | `services/sftpgo` | `railway.toml` | ✅ Optional | `/data` |

### 3. Set Environment Variables

Use each service's `.env.example` as a baseline. **Never commit real secrets.**

#### Web Service

```bash
# Database
MONGODB_URI=mongodb://mongo.railway.internal:27017/natealma

# Internal Service Communication
INTERNAL_CORE_BASE_URL=http://core.railway.internal:7200
INTERNAL_SERVICE_TOKEN=your-shared-secret-here
# OR for JWT mode:
INTERNAL_JWT_SIGNING_KEYS=[{"kid":"k1","secret":"...","active":true}]

# Auth
AUTH_SECRET=your-auth-secret-here
AUTH_URL=https://your-app.railway.app
NEXT_PUBLIC_APP_URL=https://your-app.railway.app

# Book Import (optional)
BOOK_SOURCE_MODE=manifest
BOOK_SOURCE_DIR=/data/content
BOOK_IMPORT_MANIFEST=/data/content/manifest.json
BOOK_CANONICAL_COLLECTION=book_sections
BOOK_TOC_COLLECTION=book_toc
BOOK_IMPORT_ENABLED=false
BOOK_IMPORT_DRY_RUN=true
```

#### Core Service

```bash
# Must match web service
INTERNAL_SERVICE_TOKEN=your-shared-secret-here

# Setup & State
SETUP_PASSWORD=your-secure-setup-password
OPENCLAW_STATE_DIR=/data/.openclaw
OPENCLAW_WORKSPACE_DIR=/data/workspace
OPENCLAW_GATEWAY_TOKEN=your-gateway-token-here

# Book Import (same as web)
BOOK_SOURCE_MODE=manifest
BOOK_SOURCE_DIR=/data/content
# ... etc
```

#### Mongo Service

```bash
REPLICA_SET_NAME=rs0
MONGO_INITDB_ROOT_USERNAME=admin
MONGO_INITDB_ROOT_PASSWORD=your-secure-password
KEYFILE=/data/keyfile
MONGO_PORT=27017
MONGO_PRIMARY_HOST=mongo.railway.internal
```

#### SFTPGo Service (Optional)

```bash
SFTPGO_DEFAULT_ADMIN_USERNAME=admin
SFTPGO_DEFAULT_ADMIN_PASSWORD=your-secure-password
SFTPGO_HTTPD__BINDINGS__0__PORT=8080
SFTPGO_SFTPD__BINDINGS__0__PORT=2022
SFTPGO_DATA_ROOT=/data/sftpgo
```

---

## Local Development

### Web Service

```bash
cd services/web
npm install
npm run dev
```

Production build check:
```bash
npm run build
```

### Container Build Checks

```bash
# Web
docker build -f services/web/Dockerfile services/web

# Core
docker build -f services/core/Dockerfile services/core

# Mongo
docker build -f services/mongo/nodes/Dockerfile services/mongo/nodes
```

---

## The Book-First UI

### Three-Column Sacred Shell

The core layout is a **stable 3-column shell** that remains consistent across all book-related pages:

| Column | Width | Purpose |
|--------|-------|---------|
| **Left Rail** | 280px | TOC Tree (Parts → Chapters → Sections) |
| **Center** | 760px max | Reader content, Library lists, Notes |
| **Right Rail** | 360px | Agent panel with learning tools |

### Responsive Adaptation

| Breakpoint | Layout |
|------------|--------|
| `≥1536px` (2xl) | Full 3-column |
| `≥1280px` (xl) | 2-column + Agent drawer |
| `≥1024px` (lg) | 1-column + TOC drawer + Agent drawer |
| `<1024px` | Mobile: full-width sheets |

### Required Page Set

1. **Library** (`/book`) — Book index with progress
2. **Reader** (`/book/[...slug]`) — Section view with structured blocks
3. **Notes** (`/notes`) — Filterable note collection
4. **Playbooks** (`/playbooks`) — Draft → Published lifecycle
5. **Admin** (`/admin`) — Status, reindex, audit log
6. **Login** (`/login`) — Secure authentication

### Structured Content Blocks

Every section in the Reader displays (when present):

- **TL;DR** — ≤3 bullet summary
- **Checklist** — ≤5 actionable items
- **Common Mistakes** — ≤3 pitfalls
- **Drill** — 1 exercise

### Agent Panel Skills

The right rail exposes **buttonable skills** for the current section:

1. **Explain/Rephrase** — Simple / Technical / Analogy modes
2. **Socratic Tutor** — 3-5 questions to test understanding
3. **Flashcards/Quiz** — 5-10 Q&A pairs
4. **Checklist Builder** — Pre/During/Post trade checklist
5. **Scenario Tree Builder** — If/Then decision trees
6. **Notes Assistant** — Create, tag, and link notes

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

POST /api/agent/skill                 # Run agent skill

GET  /api/admin/status                # System status (admin)
POST /api/admin/book/reindex          # Trigger reindex (admin)
```

### Internal Endpoints (Web → Core)

```
POST /internal/search                 # QMD semantic search
POST /internal/agent/run              # Execute agent skill
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
3. **Mongo Auth** — Replica set with credentials

### Rate Limits

| Endpoint | Limit |
|----------|-------|
| Login | 5 attempts / 15 min / IP |
| Agent skills | 10 / min, 100 / hour / user |
| Search | 30 / min / user |
| Admin actions | 5 / min / admin |

### Security Checklist

- [ ] Only `web` is publicly exposed
- [ ] MongoDB has no public port
- [ ] Core service has no public HTTP
- [ ] Service-to-service auth implemented
- [ ] Rate limiting enabled
- [ ] CORS locked to web domain only
- [ ] Audit logging for admin and agent actions

---

## Operational Commands

### Validation Baseline

```bash
# Core health
openclaw --version
openclaw status
openclaw doctor

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

See `docs/PREDEPLOY_NEXT_STEPS.md` for the full deployment checklist.

---

## Documentation

### Getting Started

| Document | Purpose |
|----------|---------|
| [docs/README.md](./docs/README.md) | Documentation index and quick reference |
| [docs/service-architecture.md](./docs/service-architecture.md) | Three-service Railway deployment architecture |
| [docs/book-first-ui.md](./docs/book-first-ui.md) | Calm Research UI pattern and layout system |

### Core Features

| Document | Purpose |
|----------|---------|
| [docs/mongodb-data-layer.md](./docs/mongodb-data-layer.md) | Data model, collections, and schema design |
| [docs/internal-service-auth.md](./docs/internal-service-auth.md) | JWT-based service-to-service authentication |
| [docs/agent-skills.md](./docs/agent-skills.md) | AI-assisted study tools and integration |
| [docs/security-rate-limiting.md](./docs/security-rate-limiting.md) | Defense in depth and rate limiting |
| [docs/sleep-scale-to-zero.md](./docs/sleep-scale-to-zero.md) | Handling Railway cold starts gracefully |
| [docs/operations-deployment.md](./docs/operations-deployment.md) | Deployment workflows and operations |

### Reference

| Document | Purpose |
|----------|---------|
| [docs/PREDEPLOY_NEXT_STEPS.md](./docs/PREDEPLOY_NEXT_STEPS.md) | Deployment checklist and secrets wiring map |
| [docs/SSH_SFTPGO_GO_LIVE.md](./docs/SSH_SFTPGO_GO_LIVE.md) | SFTP configuration and go-live checks |
| [docs/features.json](./docs/features.json) | Machine-readable feature specification |
| `services/*/README.md` | Service-specific documentation |
| `services/*/.env.example` | Environment variable templates |

---

## Planned Features (Roadmap)

The following features are planned for future development based on research notes and user needs:

### Trading & Analytics Add-ons

| Feature | Description | Status |
|---------|-------------|--------|
| **Paper Trading Integration** | Alpaca paper trading for validating signals without real capital | Planned |
| **Options Chain Feed** | Brokerage API integration for options quotes and Greeks | Research |
| **Volatility Regime Engine** | HV/IV analysis, ATR, trend/mean-reversion classification | Planned |
| **Payoff & Greeks Calculator** | PnL curves, break-evens, theta decay profiles | Planned |
| **Position Sizing Module** | Risk per trade, max portfolio exposure calculations | Planned |
| **Alerts Engine** | Price/level alerts, volatility alerts, time-based alerts | Planned |
| **EDGAR Watcher** | SEC filings monitoring for SPY top holdings with diff summaries | Planned |
| **FRED Macro Context** | Interest rates, CPI, unemployment data integration | Planned |
| **Trade Journal** | Paper + real trade logging with screenshots and thesis | Planned |
| **Backtesting Harness** | Simple rules validation without overfitting | Research |

### Data Sources

| Source | Purpose | Cost |
|--------|---------|------|
| **Alpaca Paper Trading** | Simulate trades and track positions | Free |
| **FRED API** | Economic indicators and macro data | Free |
| **SEC EDGAR API** | Filings and material changes | Free |
| **GDELT** | Global news dataset for event radar | Free |
| **Stooq** | Historical market data for research | Free |
| **Finnhub** | Earnings calendar and fundamentals | Free tier |
| **Tradier** | Options chain (requires brokerage account) | Account holders |

### UX Enhancements

| Feature | Description |
|---------|-------------|
| **Telegram/Discord Bot** | Alerts and Q&A outside the web app |
| **Email Digests** | Morning plan + end-of-day recap |
| **Mobile App** | Native mobile experience (PWA first) |
| **Dashboard** | Portfolio overview and key metrics |
| **Journal** | Structured trade review and reflection |
| **Alerts Center** | Centralized alert management and history |

### Technical Infrastructure

| Feature | Description |
|---------|-------------|
| **Redis/Valkey** | Caching, session storage, queueing |
| **Dedicated Worker Service** | Background jobs for indexing and imports |
| **CDN Integration** | Static asset delivery optimization |
| **Multi-Region Deployment** | Global availability |
| **Monitoring Stack** | Prometheus/Grafana for metrics |

---

## Design System

The template follows a **calm editorial "research UI"** pattern inspired by OpenAI's design philosophy:

- **Typography:** Contemporary grotesk/neo-grotesk (Inter), strong hierarchy, relaxed line height (1.65)
- **Layout:** Three-column sacred shell (TOC left, content center, agent right)
- **Color:** Charcoal-based dark theme, one restrained accent, quiet chrome
- **Spacing:** Consistent scale (4/8/12/16/24/32/48/64), rhythmic vertical layout
- **Components:** Tailwind + shadcn/ui for standardized controls

See [Visual Style Direction](https://github.com/pcelebrado/openclaw-template/blob/main/docs/book-first-ui.md) for full details.

---

## License

[License](./LICENSE)

---

## Notes

- This template provides **configuration and code scaffolding only**
- No deployment action is required for local validation
- All secrets must be configured via Railway Variables — never commit them to git
- The Book-first UI philosophy prioritizes reading, retention, and recall over trading execution

---

<p align="center">
  <em>Built for structured learning with AI-assisted study tools</em>
</p>
