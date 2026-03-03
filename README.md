# OpenClaw Railway Template

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new/github?repo=https://github.com/pcelebrado/openclaw-template)

OpenClaw is a monorepo template for a three-service Railway architecture with a
single public entry point.

## Services

- `web` — Next.js app (public)
- `core` — OpenClaw internal runtime and integrations (internal-only)
- `mongo` — MongoDB replica set (internal-only)

## Architecture

```text
Public Internet
      |
      v
[web] (public)
  | \
  |  +--> [mongo] (internal)
  +-----> [core]  (internal)
```

Boundary rule: browsers talk only to `web`. `core` and `mongo` stay private on
Railway internal networking.

## Monorepo Layout

```text
openclaw-template/
├── services/
│   ├── web/
│   ├── core/
│   └── mongo/
├── railway.json
├── README.md
└── LICENSE
```

## Railway Setup

Create three Railway services from this repository:

1. `web`
   - Root directory: `services/web`
   - Config path: `/services/web/railway.toml`
   - Public networking: enabled
2. `core`
   - Root directory: `services/core`
   - Config path: `/services/core/railway.toml`
   - Public networking: disabled
   - Required volume mount: `/data`
3. `mongo`
   - Root directory: `services/mongo/nodes`
   - Dockerfile: `services/mongo/nodes/Dockerfile`
   - Public networking: disabled

## Environment Reference

Set variables per service using each service's `.env.example` as the baseline.

### web

- `MONGODB_URI` (internal connection string)
- `INTERNAL_CORE_BASE_URL` (internal core URL)
- `INTERNAL_SERVICE_TOKEN` (must match core)
- `AUTH_SECRET`
- `AUTH_URL`

### core

- `INTERNAL_SERVICE_TOKEN` (must match web)
- `SETUP_PASSWORD`
- `OPENCLAW_STATE_DIR` (`/data/.openclaw`)
- `OPENCLAW_WORKSPACE_DIR` (`/data/workspace`)

### mongo

- `REPLICA_SET_NAME`
- `MONGO_INITDB_ROOT_USERNAME`
- `MONGO_INITDB_ROOT_PASSWORD`

Never commit real secrets.

## Local Development

```bash
# web
cd services/web
npm install
npm run dev
```

```bash
# web production build check
cd services/web
npm run build
```

```bash
# container build checks
docker build -f services/web/Dockerfile services/web
docker build -f services/core/Dockerfile services/core
docker build -f services/mongo/nodes/Dockerfile services/mongo/nodes
```

## Notes

- This template is configuration and code scaffolding only.
- No deployment action is required for local validation.
