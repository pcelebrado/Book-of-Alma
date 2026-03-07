# OpenClaw Railway Template Documentation

Welcome to the comprehensive documentation for the OpenClaw Railway Template—a book-first MVP architecture providing a calm, editorial learning environment with AI-assisted study tools.

## Quick Start

- **[Service Architecture](./service-architecture.md)** — Understand the two-service architecture
- **[Book-First UI](./book-first-ui.md)** — Learn about the calm research UI pattern
- **[Predeploy Next Steps](./PREDEPLOY_NEXT_STEPS.md)** — Deployment checklist and secrets wiring map

## Feature Documentation

### Core Features

1. **[Service Architecture](./service-architecture.md)** — Two-service Railway deployment (Web + Core)
2. **[Book-First UI](./book-first-ui.md)** — Calm research UI with three-column sacred shell
3. **[MongoDB Data Layer](./mongodb-data-layer.md)** — Historical migration notes (core-backed stores)
4. **[Internal Service Authentication](./internal-service-auth.md)** — JWT-based service-to-service auth
5. **[Agent Skills & AI Integration](./agent-skills.md)** — Six AI-assisted study tools
6. **[Security & Rate Limiting](./security-rate-limiting.md)** — Defense in depth with rate limiting
7. **[Sleep/Scale-to-Zero UX](./sleep-scale-to-zero.md)** — Graceful handling of cold starts
8. **[Operations & Deployment](./operations-deployment.md)** — Deployment workflows and operations

## Architecture Overview

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
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                          │
│                              ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    [core] — Internal Only                         │   │
│  │                                                                  │   │
│  │  ┌──────────────┐  ┌────────────────────────────────────────┐   │   │
│  │  │   OpenClaw   │  │     Core-backed Data + QMD Search     │   │   │
│  │  │  (AI Agent)  │  │      (JSON stores + sqlite index)     │   │   │
│  │  └──────────────┘  └────────────────────────────────────────┘   │   │
│  │                                                                  │   │
│  │  Single Railway volume: /data                                    │   │
│  │  • /data/.openclaw — Config & state                              │   │
│  │  • /data/workspace  • /data/web-*.json — web app stores         │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

**Two-service architecture:** Browsers talk only to `web`. The `core` service runs OpenClaw, QMD, and core-backed app stores together on a single persistent volume.

## Design Philosophy

This template implements the **"Calm Research UI"** pattern:

- **Editorial first** — Typography and rhythm carry the design
- **Calm density** — Full but breathable; never cramped
- **Quiet chrome** — Minimal borders, subtle surfaces
- **One accent** — Restrained color for focus and links
- **No empty pages** — Every state has purpose and a next action
- **No silent failure** — Every async action shows status, timestamp, and retry

## API Reference

### Public Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/book/toc` | Table of contents |
| GET | `/api/book/section?slug=...` | Section content |
| GET | `/api/book/search?q=...` | Semantic search |
| POST | `/api/notes` | Create note |
| GET | `/api/notes` | List notes |
| POST | `/api/highlights` | Create highlight |
| POST | `/api/bookmarks/toggle` | Toggle bookmark |
| POST | `/api/progress` | Update reading progress |
| POST | `/api/agent/skill` | Run agent skill |
| GET | `/api/admin/status` | System status (admin) |
| POST | `/api/admin/book/reindex` | Trigger reindex (admin) |

### Internal Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/internal/search` | QMD semantic search |
| POST | `/internal/agent/run` | Execute agent skill |
| POST | `/internal/index/rebuild` | Rebuild search index |
| GET | `/internal/index/status?jobId=...` | Index job status |
| GET | `/internal/health` | Health check |

## Configuration

See individual feature documents for detailed configuration options.

### Quick Environment Setup

```bash
# Web Service
INTERNAL_CORE_BASE_URL=http://openclaw-core.railway.internal:2022
INTERNAL_SERVICE_TOKEN=changeme-generate-a-strong-random-token
AUTH_SECRET=your-auth-secret
AUTH_URL=https://your-app.railway.app

# Core Service (OpenClaw + QMD + core-backed stores)
INTERNAL_SERVICE_TOKEN=changeme-generate-a-strong-random-token
SETUP_PASSWORD=your-secure-setup-password
OPENCLAW_STATE_DIR=/data/.openclaw
OPENCLAW_WORKSPACE_DIR=/data/workspace
```

## Deployment

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new/github?repo=https://github.com/pcelebrado/openclaw-template)

See [Operations & Deployment](./operations-deployment.md) for detailed deployment procedures.

## Additional Resources

- [PREDEPLOY_NEXT_STEPS.md](./PREDEPLOY_NEXT_STEPS.md) — Pre-deployment checklist
- [SSH_SFTPGO_GO_LIVE.md](./SSH_SFTPGO_GO_LIVE.md) — SFTP configuration guide
- [features.json](./features.json) — Machine-readable feature specification

## License

See [LICENSE](../LICENSE) for details.

---

*Built for structured learning with AI-assisted study tools*
