# Service Architecture

## Overview

The template runs as a two-service Railway deployment:

- `openclaw-web` (public): Next.js UI + API + SQLite datastore
- `openclaw-core` (internal): OpenClaw runtime + QMD + SFTPGo

This architecture removes MongoDB from the app path and standardizes storage on
SQLite for web-facing product data.

## Topology

```
Internet
  |
  v
[openclaw-web]  (public HTTP)
  - Library/Reader/Notes/Playbooks/Admin
  - Auth/session management
  - API routes (/api/*)
  - SQLite at /data/web.db
  |
  | private Railway networking
  v
[openclaw-core] (internal service)
  - OpenClaw gateway/setup/admin
  - Internal endpoints (/internal/*)
  - QMD for semantic retrieval
  - SFTPGo for content upload
  - Persistent state on /data
```

## Persistence model

Both services require their own `/data` volume mount:

- Web volume:
  - `/data/web.db` (SQLite application datastore)
- Core volume:
  - `/data/.openclaw`
  - `/data/workspace`
  - `/data/book-source`
  - `/data/sftpgo`

If the web volume is missing, SQLite becomes ephemeral and user data is lost on
redeploy.

## Internal networking

- `web` calls `core` at `http://core.railway.internal:8080`.
- Internal calls are authenticated via bearer token (`INTERNAL_SERVICE_TOKEN`).
- Core does not need to expose public HTTP for app operation.

## Request flow examples

### Reader load

1. Browser requests section route on web.
2. Web validates session.
3. Web reads section content from SQLite (`book_sections`).
4. Web optionally calls core search endpoint for assistant context.
5. Web returns rendered response.

### Agent/tool action

1. Browser posts to web API route.
2. Web validates auth + rate limit in SQLite (`rate_limits`).
3. Web calls core `/internal/agent/run`.
4. Web stores audit/log metadata in SQLite (`audit_log`).
5. Web returns action result.

## Data layer components

- Schema: `services/web/src/lib/db/schema.sql`
- Connection: `services/web/src/lib/db/sqlite.ts`
- Repositories: `services/web/src/lib/db/repositories.ts`
- Legacy shim exports: `services/web/src/lib/db/collections.ts`

## Security boundary

Allowed traffic:

- Browser -> Web: allowed (public)
- Web -> Core: allowed (private/internal)

Blocked by architecture:

- Browser -> Core internal endpoints
- Browser -> SQLite file access

## Build/deploy constraints

- `better-sqlite3` is a native module; build image must include compile tools.
- Next 14 standalone output must set:
  - `experimental.serverComponentsExternalPackages: ['better-sqlite3']`
- Web and core health checks:
  - Web: `/api/health`
  - Core: `/setup/healthz`

## Environment highlights

Web:

- `SQLITE_DB_PATH=/data/web.db`
- `INTERNAL_CORE_BASE_URL=http://core.railway.internal:8080`
- `INTERNAL_SERVICE_TOKEN=<shared-token>`

Core:

- `OPENCLAW_STATE_DIR=/data/.openclaw`
- `OPENCLAW_WORKSPACE_DIR=/data/workspace`
- `INTERNAL_SERVICE_TOKEN=<shared-token>`

## Migration note

This document supersedes older architecture references that modeled an embedded
or separate MongoDB service for web application data.

Decision linkage: `DECISION_197`.
