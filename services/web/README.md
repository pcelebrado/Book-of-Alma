# OpenClaw Web — Railway Template

A **Next.js App Router** frontend for the OpenClaw book-first learning platform.
Designed for one-click deployment on [Railway](https://railway.app).

## What you get

- **Library** — Book index with Table of Contents navigation
- **Reader** — 3-column editorial layout (TOC rail, content, Agent panel)
- **Notes** — Highlights, tags, and backlinks across the Book
- **Playbooks** — Checklists and scenario trees built from the Book
- **Admin** — System health, book reindex, and remediation controls
- **Login** — Auth shell ready for Auth.js provider configuration at deploy time
- **Health endpoint** — `/api/health` for Railway probes

## Architecture

This is **Service A** in the OpenClaw Railway deployment:

```
Browser → [web] (public) → [core] (internal) → OpenClaw Gateway + QMD
```

- The web service is the **only public-facing service**.
- Internal calls to the core service use a shared `INTERNAL_SERVICE_TOKEN`.
- Web service data and control-plane calls are core-backed over internal auth.

## Deploy on Railway

1. Create a new Railway project from this repo
2. Set environment variables (see `.env.example`):
   - `INTERNAL_CORE_BASE_URL` — internal core service URL
   - `INTERNAL_SERVICE_TOKEN` — shared auth token (must match core service)
   - `AUTH_SECRET` — session encryption key
3. Enable **Public Networking** (HTTP)
4. Deploy

## Local development

```bash
npm install
npm run dev
# Open http://localhost:3000
```

## Environment variables

See `.env.example` for the full list. Key variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `INTERNAL_CORE_BASE_URL` | Yes | Core service URL (internal) |
| `INTERNAL_SERVICE_TOKEN` | Yes | Service-to-service auth token |
| `AUTH_SECRET` | Yes | NextAuth session secret |

## Tech stack

- [Next.js 14](https://nextjs.org/) (App Router)
- [Tailwind CSS](https://tailwindcss.com/)
- [TypeScript](https://www.typescriptlang.org/)
- React 18

## Project structure

```
src/
├── app/
│   ├── admin/        # Admin status + remediation
│   ├── api/health/   # Railway health probe
│   ├── book/         # Reader (3-column layout)
│   ├── login/        # Auth shell
│   ├── notes/        # Notes management
│   ├── playbooks/    # Playbooks
│   ├── layout.tsx    # Root layout + navigation
│   └── page.tsx      # Library (landing)
└── lib/
    └── env.ts        # Server-side environment helpers
```

## Related services

- [`openclaw-core`](https://github.com/pcelebrado/openclaw-core) — OpenClaw Gateway wrapper (internal)

## License

MIT License — see [LICENSE](LICENSE).
