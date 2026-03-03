# Service Architecture

## Overview

The OpenClaw Railway Template implements a **three-service architecture** designed for secure, scalable deployment on Railway. This architecture enforces a strict security boundary where only the web service is publicly exposed, while internal services remain protected behind Railway's internal networking.

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

---

## Quick Start

Deploy the entire stack to Railway in minutes:

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new/github?repo=https://github.com/pcelebrado/openclaw-template)

**Manual deployment steps:**
1. Fork this repository
2. Create a new Railway project
3. Add services: `web`, `core`, `mongo` (and optionally `sftpgo`)
4. Configure environment variables (see Configuration section)
5. Deploy!

---

## The Three Services

### 1. Web Service (Next.js)

**Type:** Public-facing application  
**Stack:** Next.js 14, Tailwind CSS, shadcn/ui  
**Exposure:** Public HTTP (the ONLY public entry point)

**Responsibilities:**
- Serves the Book-first UI (Library, Reader, Notes, Playbooks, Admin)
- Handles authentication and session management via NextAuth
- Provides API routes (`/api/*`) for browser requests
- Makes server-to-server calls to internal services (Core)
- Reads and writes MongoDB for all application data
- Generates correlation IDs (`X-Request-Id`) for distributed tracing

**Key Features:**
- Three-column sacred shell layout
- Command palette (⌘K) for quick navigation
- Agent panel with AI-assisted study tools
- Responsive design from mobile to desktop
- Rate limiting and security middleware

**Internal Communication:**
The web service communicates with Core using:
- `Authorization: Bearer <jwt>` header for authentication
- `X-Request-Id: <uuid>` header for request tracing
- `X-User-Id` and `X-User-Role` headers for user context

---

### 2. Core Service (Internal)

**Type:** Docker container with bundled services  
**Components:** OpenClaw + QMD + SFTPGo  
**Exposure:** Internal-only (no public HTTP)

**Responsibilities:**
- Executes agent skills via `/internal/agent/run`
- Provides semantic search via QMD (`/internal/search`)
- Handles indexing and reindex jobs via `/internal/index/rebuild`
- Optional SFTP-based file workflows for content management

**Process Management:**
The core service uses `s6-overlay` as a process supervisor to manage multiple long-lived processes:

1. **QMD** (port 7100) — Vector search engine for semantic search
2. **OpenClaw** (port 7200) — Agent runtime and orchestration
3. **SFTPGo** (port 7300) — File management interface

**Startup Sequence:**
1. Load configs from environment + mounted config directory
2. Ensure writable paths exist (indexes, uploads, logs)
3. Validate required environment variables (fail fast if missing)
4. Start QMD and wait for health check (timeout: 60s)
5. Start OpenClaw and wait for health check
6. Start SFTPGo

**Health Check Semantics:**
```http
GET /internal/health
Authorization: Bearer <jwt>

Response (healthy):
{
  "ok": true,
  "components": {
    "qmd": "ok",
    "agent": "ok",
    "sftpgo": "ok"
  }
}

Response (degraded):
{
  "ok": false,
  "components": {
    "qmd": "ok",
    "agent": "error: connection refused",
    "sftpgo": "ok"
  }
}
```

**Note:** Even when degraded, the endpoint returns HTTP 200 so the Web UI can display status (no silent failure).

---

### 3. MongoDB Service (Internal)

**Type:** MongoDB replica set  
**Exposure:** Internal-only (no public port)

**Responsibilities:**
- Persistent storage for book content
- User-generated data (notes, highlights, bookmarks, progress)
- Playbooks (draft → published lifecycle)
- Audit logging for security and compliance
- Rate limiting counters with TTL

**Collections:**
- `book_sections` — Canonical book content with frontmatter
- `book_toc` — Cached table of contents for fast rendering
- `notes` — User notes linked to sections and anchors
- `highlights` — Text highlights in Reader with color coding
- `bookmarks` — Quick save points for navigation
- `reading_progress` — Continue reading feature data
- `playbooks` — Trading procedures and checklists
- `agent_runs` — AI interaction history for audit
- `audit_log` — Security and admin events
- `rate_limits` — Rate limiting counters (TTL: 2 hours)

---

## Railway Internal Networking

Railway provides internal DNS resolution for service-to-service communication:

```
web.railway.internal    → Web service (public HTTP)
core.railway.internal   → Core service (OpenClaw + embedded MongoDB + QMD)
```

> **Note:** MongoDB runs embedded inside the `core` container. There is no separate
> `mongo.railway.internal` service on the free plan. The web service connects to
> MongoDB via `core.railway.internal:27017`.

**Key Points:**
- Services within the same Railway project can communicate via these hostnames
- No public internet required for internal traffic
- Traffic stays within Railway's private network (encrypted Wireguard tunnels)
- DNS resolution is automatic—no configuration needed
- Railway private networking supports any TCP/UDP port, not just the HTTP port

**Example Connection:**
```javascript
// Web service connecting to Core HTTP API
const coreClient = new CoreClient({
  baseUrl: 'http://core.railway.internal:8080'
});

// Web service connecting to MongoDB (embedded in core container)
const mongoClient = new MongoClient(
  'mongodb://core.railway.internal:27017/openclaw'
);
```

---

## Security Boundary

### Public/Private Rule

| Traffic Pattern | Allowed | Notes |
|----------------|---------|-------|
| Browser → Web | ✅ Yes | Only public entry point |
| Web → Core | ✅ Yes | Internal only, authenticated |
| Web → MongoDB | ✅ Yes | Internal only, authenticated |
| Browser → Core | ❌ No | Forbidden—no public port |
| Browser → MongoDB | ❌ No | Forbidden—no public port |

### Authentication Layers

1. **User Authentication** — NextAuth sessions with HTTP-only cookies
   - Secure, signed cookies for session state
   - CSRF protection enabled
   - Session expiration and refresh

2. **Service Authentication** — JWT or shared secret between Web ↔ Core
   - Short-lived JWTs (5-15 minute TTL)
   - HMAC-SHA256 (HS256) signing
   - Dual-key rotation support
   - See [Internal Service Authentication](./internal-service-auth.md)

3. **Database Authentication** — MongoDB replica set with credentials
   - Replica set authentication enabled
   - Keyfile for internal node authentication
   - Role-based access control

### Request Tracing

Every request includes a correlation ID for distributed tracing:

```
Browser → Web: X-Request-Id: <uuid>
Web → Core:   X-Request-Id: <same-uuid>
```

This allows tracking a single user action across all services in logs.

---

## Request Flows

### Reader Load (Typical)

```
1. Browser requests /book/[section]
   Headers: Cookie: session=..., X-Request-Id: uuid-1

2. Web service validates session
   → NextAuth validates session cookie

3. Web service fetches section from MongoDB
   → Query: { slug: "part-1/ch-1/section-1" }

4. Web service optionally calls Core for related suggestions
   → POST /internal/search
   → Headers: Authorization: Bearer <jwt>, X-Request-Id: uuid-1

5. Page renders with Reader + Agent panel
   → HTML + React hydration
```

**Latency Targets:**
- MongoDB query: <50ms
- Core search (if cached): <100ms
- Total page load: <500ms

---

### Search (Command Palette)

```
1. Browser calls /api/book/search?q=gamma+basics
   → User types in ⌘K command palette

2. Web service validates session and rate limit
   → Check: search:user:{userId} < 30/min

3. Web service calls Core /internal/search
   → POST { q: "gamma basics", limit: 10 }
   → Headers: Authorization: Bearer <jwt>, X-Request-Id: uuid-2

4. Core returns QMD semantic search results
   → Results ranked by vector similarity

5. Web service returns sanitized results
   → Strip internal IDs, format for display
```

**Fallback:** If Core is unavailable, optionally fall back to MongoDB text search.

---

### Agent Skill Run

```
1. Browser calls /api/agent/skill
   → POST { skill: "explain", context: {...} }

2. Web service validates session and rate limit
   → Check: agent:user:{userId} < 10/min

3. Web service constructs JWT for Core authentication
   → Sign JWT with 10-minute expiry
   → Include user ID and role claims

4. Web service calls Core /internal/agent/run
   → Headers: Authorization: Bearer <jwt>, X-Request-Id: uuid-3

5. Core executes skill with OpenClaw
   → Process request, generate response

6. Core returns structured output
   → { output: {...}, saveSuggestions: {...} }

7. Web service logs to agent_runs collection
   → Audit trail for debugging

8. Web service returns response to browser
   → Display in Agent Panel
```

---

### Reindex (Admin)

```
1. Admin clicks "Reindex Book" in Admin panel

2. Browser calls /api/admin/book/reindex
   → POST { scope: "book", dryRun: false }

3. Web service validates admin role
   → Check: user.role === "admin"

4. Web service triggers Core /internal/index/rebuild
   → Headers: Authorization: Bearer <jwt>, X-Request-Id: uuid-4

5. Core starts reindex job
   → Returns { started: true, jobId: "job-abc-123" }

6. Web service stores job record
   → Create document in jobs collection

7. Web service returns jobId to browser
   → Display: "Reindex started"

8. UI polls /api/admin/status for progress
   → Every 5 seconds until complete
```

**Job States:** `queued` → `running` → `succeeded` | `failed`

---

## Sleep/Scale-to-Zero Support

Railway may sleep services when idle to conserve resources. The architecture handles this gracefully:

### Service Behaviors

| Service | Sleep Behavior | Wake Time |
|---------|---------------|-----------|
| **Web** | Stays responsive | N/A (always on) |
| **Core** | May sleep after inactivity | 5-30 seconds |
| **MongoDB** | Stays available or wakes quickly | <5 seconds |

### No Silent Failure Compliance

The UI handles Core unavailability with clear messaging:

**When Core is sleeping:**
```
⏳ Waking assistant...
This can take a few seconds after inactivity.
[Retry] [Continue reading →]
```

**When Core is unavailable:**
```
⚠️ Assistant temporarily unavailable
Try again in a moment.
[Retry]
Last success: 5 minutes ago
```

**Key Principles:**
- Users can always continue reading book content
- Every failure state shows a message + retry option
- No infinite retry loops (max 1 auto-retry)
- Telemetry logs track wake times for tuning

See [Sleep/Scale-to-Zero UX](./sleep-scale-to-zero.md) for full details.

---

## Configuration

### Service Setup

| Service | Root Directory | Public Network | Volumes | Required |
|---------|---------------|----------------|---------|----------|
| `web` | `services/web` | ✅ Enabled | — | Yes |
| `core` | `services/core` | ❌ Disabled | `/data` | Yes |
| `mongo` | `services/mongo/nodes` | ❌ Disabled | — | Yes |
| `sftpgo` | `services/sftpgo` | ✅ Optional | `/data` | No |

### Volume Mounting

**Core Service:**
- Mount `/data` for persistent storage
- Stores: indexes, uploads, logs, state
- Size: Minimum 10GB recommended

**SFTPGo Service (Optional):**
- Mount `/data` for file storage
- Stores: uploaded content, user files

### Environment Variables

#### Web Service (Required)

| Variable | Example | Description |
|----------|---------|-------------|
| `MONGODB_URI` | `mongodb://core.railway.internal:27017/openclaw` | MongoDB connection string (embedded in core) |
| `INTERNAL_CORE_BASE_URL` | `http://core.railway.internal:7200` | Core service URL |
| `INTERNAL_JWT_SIGNING_KEYS` | `[{"kid":"k1","secret":"...","active":true}]` | JWT signing keys |
| `AUTH_SECRET` | `openssl rand -base64 32` | NextAuth secret |
| `AUTH_URL` | `https://your-app.railway.app` | Auth callback URL |
| `NEXT_PUBLIC_APP_URL` | `https://your-app.railway.app` | Public app URL |

#### Web Service (Optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `INTERNAL_SERVICE_TOKEN` | — | Shared secret (fallback to JWT) |
| `BOOK_SOURCE_MODE` | `manifest` | Book import mode |
| `BOOK_IMPORT_ENABLED` | `false` | Enable book import |
| `BOOK_IMPORT_DRY_RUN` | `true` | Test import without writing |

#### Core Service (Required)

| Variable | Example | Description |
|----------|---------|-------------|
| `INTERNAL_JWT_VERIFY_KEYS` | `[{"kid":"k1","secret":"...","active":true}]` | JWT verification keys |
| `SETUP_PASSWORD` | Secure random | Setup/admin password |
| `OPENCLAW_STATE_DIR` | `/data/.openclaw` | State directory |
| `OPENCLAW_WORKSPACE_DIR` | `/data/workspace` | Workspace directory |
| `OPENCLAW_GATEWAY_TOKEN` | Secure random | Gateway token |

#### Core Service (Optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `INTERNAL_SERVICE_TOKEN` | — | Shared secret (fallback) |
| `QMD_PORT` | `7100` | QMD service port |
| `OPENCLAW_PORT` | `7200` | OpenClaw service port |
| `SFTPGO_PORT` | `7300` | SFTPGo service port |

#### MongoDB Service (Required)

| Variable | Example | Description |
|----------|---------|-------------|
| `REPLICA_SET_NAME` | `rs0` | Replica set name |
| `MONGO_INITDB_ROOT_USERNAME` | `admin` | Root username |
| `MONGO_INITDB_ROOT_PASSWORD` | Secure random | Root password |
| `KEYFILE` | `/data/keyfile` | Path to replica keyfile |

---

## Monitoring and Observability

### Health Endpoints

| Endpoint | Service | Purpose |
|----------|---------|---------|
| `/api/health` | Web | Public health check |
| `/internal/health` | Core | Internal health + component status |
| `/setup/api/status` | Core | Setup/configuration status |

### Log Locations

**Web Service:**
- Application logs: stdout (captured by Railway)
- Audit logs: `audit_log` collection in MongoDB

**Core Service:**
- Application logs: `/data/logs/` (if volume mounted)
- Process logs: Managed by s6-overlay

### Key Metrics to Monitor

| Metric | Alert Threshold | Action |
|--------|-----------------|--------|
| Core response time | >5s | Check if waking from sleep |
| MongoDB connections | >90% of pool | Scale connection pool |
| Error rate | >1% | Investigate logs |
| Rate limit hits | >100/hour | Check for abuse |

---

## Deployment Configuration

### railway.json

```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "watchPatterns": [
      "railway.json",
      "services/web/**",
      "services/core/**",
      "services/mongo/**",
      "!**/*.test.ts",
      "!**/*.test.tsx",
      "!**/node_modules/**"
    ]
  },
  "deploy": {
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

**Watch Patterns:**
- Changes to `railway.json` trigger full redeploy
- Changes to service directories trigger service-specific redeploy
- Test files and node_modules are excluded

### Deployment Triggers

| File Changed | Services Redeployed |
|--------------|---------------------|
| `railway.json` | All services |
| `services/web/**` | Web only |
| `services/core/**` | Core only |
| `services/mongo/**` | Mongo only |

---

## Deployment Checklist

### Pre-Deployment
- [ ] Forked repository to your account
- [ ] Created Railway project
- [ ] Generated secure secrets (JWT keys, auth secrets)
- [ ] Configured environment variables for all services

### Service Configuration
- [ ] Only Web service is publicly exposed
- [ ] MongoDB has no public port
- [ ] Core service has no public HTTP
- [ ] `/data` volume mounted on Core service
- [ ] Internal networking configured (`.railway.internal`)

### Security
- [ ] Service-to-service auth implemented (JWT)
- [ ] Rate limiting enabled
- [ ] CORS locked to web domain only
- [ ] Audit logging configured
- [ ] Secrets not committed to git

### Validation
- [ ] Health check endpoints responding
- [ ] Web can connect to MongoDB
- [ ] Web can connect to Core
- [ ] Authentication flow working
- [ ] Agent skills responding

---

## Troubleshooting

### Core Service Unreachable

**Symptoms:** Agent panel shows "Assistant unavailable"

**Check:**
```bash
# From Web service, test Core connectivity
curl -H "Authorization: Bearer <jwt>" \
     http://core.railway.internal:7200/internal/health
```

**Common Causes:**
- Core service is sleeping (normal—will wake on request)
- JWT verification keys don't match between Web and Core
- Core failed to start (check logs)
- Network policy blocking internal traffic

**Error Messages:**
```
"Connection refused" → Core not running
"Unauthorized" → JWT mismatch or expired
"Timeout" → Core waking from sleep (retry)
```

---

### MongoDB Connection Failed

**Symptoms:** Web shows database errors, pages don't load

**Check:**
```bash
# Verify replica set is initialized (MongoDB runs inside core container)
# From within the core container or via Railway shell:
mongosh "mongodb://127.0.0.1:27017" --eval "rs.status()"
# From the web service, connect via private networking:
# mongosh "mongodb://core.railway.internal:27017" --eval "rs.status()"
```

**Common Causes:**
- Replica set not initialized (run init script)
- Credentials incorrect in MONGODB_URI
- MongoDB service not running
- Network connectivity issues

**Error Messages:**
```
"Authentication failed" → Wrong credentials
"Connection refused" → MongoDB not running
"Not primary" → Replica set election in progress
```

---

### Agent Skills Not Working

**Symptoms:** Agent panel shows error or hangs

**Check:**
1. Core health: `curl /internal/health`
2. Rate limiting: Check `rate_limits` collection
3. Agent runs: Query `agent_runs` for errors

**Common Causes:**
- Core service unavailable
- Rate limit exceeded
- OpenClaw configuration error
- Invalid JWT token

**Debug Steps:**
```javascript
// Check recent agent run errors
db.agent_runs.find({
  createdAt: { $gte: new Date(Date.now() - 3600000) }
}).sort({ createdAt: -1 }).limit(10)
```

---

### Deployment Failures

**Symptoms:** Services fail to deploy or crash loop

**Check:**
1. Railway dashboard logs
2. Environment variables set correctly
3. Required volumes mounted
4. Port configurations correct

**Common Causes:**
- Missing required environment variables
- Port conflicts
- Volume not mounted (Core needs `/data`)
- Invalid Dockerfile syntax

---

## Future Evolution

Optional future additions (not required for MVP):

- **Dedicated Worker Service** — For background jobs (indexing, imports)
- **Redis/Valkey** — For caching, session storage, and queueing
- **Separate SFTPGo Service** — For admin surface isolation
- **Multi-Region Deployment** — For global availability
- **CDN Integration** — For static asset delivery
- **Monitoring Stack** — Prometheus/Grafana for metrics

---

## Related Documentation

- [Internal Service Authentication](./internal-service-auth.md) — JWT configuration and rotation
- [Sleep/Scale-to-Zero UX](./sleep-scale-to-zero.md) — Handling cold starts
- [MongoDB Data Layer](./mongodb-data-layer.md) — Data model and collections
- [Operations & Deployment](./operations-deployment.md) — Deployment workflows
- [Security & Rate Limiting](./security-rate-limiting.md) — Defense in depth

---

*Last updated: 2026-03-03*
