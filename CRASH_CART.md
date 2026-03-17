# CRASH_CART — OpenClaw Full Stack Audit

**Date**: 2026-03-05  
**Auditor**: OpenFixer (Opus)  
**Scope**: `services/web/src/` + `services/core/src/` — full codebase audit for placeholder code, error handling gaps, dead code, unwired features, and cross-service integration failures

---

## CRITICAL — Must Fix Before First Login

### C1. Every API route missing try/catch around SQLite operations

> **Updated 2026-03-16**: Web datastore migrated from MongoDB to SQLite (`better-sqlite3`) per DECISION_197. The issue pattern is identical — missing try/catch — but the target is now SQLite calls, not MongoDB operations.

**Impact**: If the SQLite file is locked, corrupt, or the volume is unmounted, these routes throw unhandled exceptions → Next.js generic 500 → no useful error for the user.

**Affected routes** (all under `src/app/api/`):
| Route | Methods | Issue |
|-------|---------|-------|
| `notes/route.ts` | POST, GET | No try/catch around db calls |
| `notes/[id]/route.ts` | PATCH, DELETE | No try/catch around db calls |
| `highlights/route.ts` | POST | No try/catch around db call |
| `progress/route.ts` | POST | No try/catch around db call |
| `progress/summary/route.ts` | GET | No try/catch around db call |
| `bookmarks/toggle/route.ts` | POST | No try/catch around db calls |
| `playbooks/route.ts` | GET | No try/catch around db call |
| `playbooks/draft/route.ts` | POST | No try/catch around db call |
| `playbooks/[id]/route.ts` | PATCH | No try/catch around db call |
| `book/section/route.ts` | GET | No try/catch around db call |
| `book/toc/route.ts` | GET | No try/catch around db calls |
| `book/search/route.ts` | GET | FTS search has try/catch; direct db access unguarded |

**Fix**: Wrap SQLite repository calls in try/catch. Return `apiError('database_error', 'descriptive message', 503)` on failure with logged details.

### C2. Book section API has no auth guard

**File**: `src/app/api/book/section/route.ts`  
**Issue**: No `requireSession()` call. Public access to book content while TOC endpoint (`book/toc/route.ts`) IS protected.  
**Fix**: Add `requireSession()` guard for consistency.

### C3. `verifyPassword` has a dead branch comparing hash to plaintext

**File**: `src/lib/auth/session.ts` line 115  
**Code**: `hash === password` — compares stored SHA-256 hash to raw plaintext password  
**Impact**: Dead branch (will never be true for valid data). Security smell — if someone stored a raw password in `passwordHash` field, this would match.  
**Fix**: Remove `hash === password` from the comparison. Keep only `hash === digest`.

---

## HIGH — Functional Gaps

### H1. Three placeholder pages in active navigation

| Page | File | Content |
|------|------|---------|
| Dashboard | `dashboard/page.tsx` | "Coming soon. Key metrics will appear here." |
| Journal | `journal/page.tsx` | "Coming soon. Your journal entries will appear here." |
| Alerts | `alerts/page.tsx` | "Coming soon. Alert automation is not yet active." |

Function names literally say `PlaceholderPage`. These are in the command palette AND the nav won't hide them.

**Fix options**: (a) Remove from nav/command palette until implemented, or (b) implement real content.

### H2. Book reader renders markdown as plain text

**File**: `src/app/book/[...slug]/page.tsx` line 128  
**Code**: `<p>{payload.body?.content ?? '...'}</p>`  
**Impact**: Raw markdown dumped into a `<p>` tag. Users see `# Heading\n\nText` instead of rendered content.  
**Fix**: Add a markdown renderer (react-markdown, @next/mdx, or similar).

### H3. Book Previous/Next navigation hardcoded to `/book`

**File**: `src/app/book/[...slug]/page.tsx` lines 132-143  
**Issue**: Both "Previous" and "Next" buttons link to `/book` landing page. Not wired to adjacent sections.  
**Fix**: Query adjacent sections from SQLite (`book_sections` table) or derive from TOC tree.

### H4. No sign-out button

**File**: `src/components/app-shell.tsx` lines 114-129  
**Issue**: Account dropdown only has "Onboarding" and "Sign in". No sign-out for logged-in users.  
**Fix**: Add `signOut()` from `next-auth/react` to dropdown.

### H5. Notes page has static filter badges

**File**: `src/app/notes/page.tsx` lines 65-66  
**Code**: `<Badge variant="outline">Tag chips</Badge>` / `<Badge variant="outline">Section filter</Badge>`  
**Impact**: Looks like functional filters but they're static text badges.  
**Fix**: Either wire to actual filter logic or remove.

---

## MEDIUM — Quality & Consistency

### M1. Dead custom session system

**File**: `src/lib/auth/session.ts`  
**Dead code**: `createSessionToken()`, `readSession()`, `setSessionCookie()`, `clearSessionCookie()`, `SESSION_COOKIE_NAME` constant  
**Issue**: Entire custom JWT session layer is unused. `auth-config.ts` uses NextAuth's built-in JWT strategy. `verifyPassword()` is the only function actually used from this file.  
**Fix**: Remove dead code or consolidate into a single auth module.

### M2. Hardcoded fallback section slug in app-shell

**File**: `src/components/app-shell.tsx` line 41  
**Code**: `'part-1-foundations/ch-1/01-gamma-basics'`  
**Impact**: Agent panel always loads this section when not on a book page. If this section doesn't exist in the DB, the agent skill will fail.  
**Fix**: Use `undefined` or `null` when not on a book page. Agent panel should handle "no section selected" state.

### M3. TOC tree progress hardcoded to zero

**File**: `src/components/toc-tree.tsx` line 124  
**Code**: `<Progress value={0} className="h-1.5" />`  
**Impact**: Progress bars always show 0% even after reading.  
**Fix**: Fetch user reading progress and merge with TOC data.

### M4. Library page — no individual error handling on fetches

**File**: `src/app/page.tsx` lines 35-39  
**Issue**: `Promise.all([toc, progress, notes])` — if any fetch throws (not just non-ok), the entire page fails.  
**Fix**: Use `Promise.allSettled` or individual try/catch per fetch.

### M5. Unused `ObjectId` import

**File**: `src/app/api/notes/route.ts` line 1  
**Issue**: `ObjectId` imported but never used in this file.  
**Fix**: Remove unused import.

---

## LOW — Polish

### L1. `logSecurityEvent` is async but never awaited consistently

Many call sites use `await logSecurityEvent(...)` which blocks the response on console.log output. Not harmful but unnecessary await on a sync operation wrapped in async.

### L2. Rate limit uses `login:ip` key prefix for registration

**File**: `src/app/api/auth/register/route.ts` line 67  
**Code**: `enforceRateLimit(RATE_LIMIT_RULES.login, ip)`  
**Issue**: Registration shares the login rate limit bucket. A user who hits rate limit on login can't register either, and vice versa.

### L3. Bookmark toggle stores empty string for missing anchorId

**File**: `src/app/api/bookmarks/toggle/route.ts` line 29  
**Code**: `anchorId: body.anchorId ?? ''`  
**Impact**: Creates bookmarks with empty string anchorId instead of undefined/null. Minor data quality issue.

---

## Architecture Notes (no action needed, for context)

1. **Auth flow is sound**: NextAuth credentials → SQLite user lookup → JWT session → middleware protection. Real implementation, not placeholder.
2. **Core service integration is clean**: `coreFetch()` with JWT service tokens, timeout, error classification. Used by agent skill and admin endpoints.
3. **Rate limiting is real**: SQLite-backed sliding window. Applied to login, agent, search, admin.
4. **Component library is real**: shadcn/ui components, sonner toasts, command palette with keyboard shortcuts. Not stubs.
5. **Security logging is real**: Structured JSON events for auth, rate limits, admin actions. Written to console (Railway captures stdout).

---

## CORE SERVICE FINDINGS

### CORE-1 UPDATE (2026-03-05)

`/internal/*` bridge routes were implemented in `services/core/src/server.js` and now map to documented OpenClaw Gateway APIs:

- `/internal/health` returns wrapper/gateway status for web admin checks.
- `/internal/agent/run` now calls OpenClaw HTTP endpoints in documented order:
  1) `POST /v1/responses` (preferred) and
  2) fallback `POST /v1/chat/completions`.
- `/internal/index/rebuild` now performs a deterministic core-side action by restarting the gateway and returning a job identifier.

Doc evidence:
- `ExternalDocs/openclaw/docs/gateway/openresponses-http-api.md`
- `ExternalDocs/openclaw/docs/gateway/openai-http-api.md`
- `ExternalDocs/openclaw/docs/gateway/tools-invoke-http-api.md`

Gateway HTTP endpoints are now force-enabled during setup + startup sync via:
- `gateway.http.endpoints.responses.enabled=true`
- `gateway.http.endpoints.chatCompletions.enabled=true`

### CORE-1. Web→Core `/internal/*` endpoints DO NOT EXIST in core service

**This is the single biggest integration gap in the entire stack.**

The web service calls three internal endpoints on core via `coreFetch()`:
| Web calls | Used by | Core has it? |
|-----------|---------|--------------|
| `GET /internal/health` | `api/admin/status/route.ts` | **NO** |
| `POST /internal/agent/run` | `api/agent/skill/route.ts` | **NO** |
| `POST /internal/index/rebuild` | `api/admin/book/reindex/route.ts` | **NO** |

The core service (`server.js`, 1496 lines) is an Express app that:
- Serves `/setup` wizard UI (HTML + JS)
- Proxies everything non-`/setup` to the OpenClaw gateway process
- Has health endpoints at `/healthz` and `/setup/healthz`
- Has debug/console endpoints under `/setup/api/*`

**None of these are `/internal/*` endpoints.** The core service has no internal API layer at all. It's a wrapper around the OpenClaw gateway binary + setup UI.

**Impact**:
- **Admin status page**: Will always show `core: unreachable` because `/internal/health` doesn't exist. The `coreFetch` call returns a `CoreClientError` caught by the status route — so it works, but always shows core as down.
- **Agent skill panel**: `POST /internal/agent/run` doesn't exist → every "Run skill" click returns `core_unavailable` error. The agent panel's error handling shows "Assistant temporarily unavailable" — functional error handling, but the feature literally cannot work.
- **Book reindex**: `POST /internal/index/rebuild` doesn't exist → reindex button always fails. Admin page catches this and shows the error.

**Root cause**: The web service was designed expecting the core to expose an internal API layer for agent skills and book indexing. The core service is actually just an OpenClaw gateway wrapper with a setup UI. These internal endpoints would need to be built into `server.js` (or a separate Express router) for the features to work.

**Severity**: HIGH for agent/reindex. MEDIUM for health (gracefully degraded). This is NOT a bug — it's unfinished integration. The web UI gracefully handles the failures, but three features will never work until core has these endpoints.

### CORE-2. Core service is solid for what it does

The core service (`server.js`) is well-built:
- Proper Basic auth on `/setup` routes
- Allowlisted console commands (no arbitrary shell execution)
- Secret redaction before sending to browser
- Gateway lifecycle management (start/stop/restart/health probe)
- Backup export/import with safe tar path validation
- Config editor with timestamped `.bak` backups
- SIGTERM handler for clean shutdown
- Gateway token injection for proxied WebSocket connections
- Dashboard auth for the OpenClaw Control UI
- Legacy config file migration (`moltbot.json` → `openclaw.json`)
- Doctor diagnostics on gateway failure

### CORE-3. Entrypoint is correct

> **Updated 2026-03-16**: MongoDB removed (DECISION_197). Entrypoint no longer starts MongoDB.

`scripts/entrypoint.sh`:
- Runs `runtime-bootstrap.sh` to wire persistent volume paths
- Starts SFTPGo (full serve mode, falls back to portable on slim image)
- SFTPGo portable directory is `/data` — full volume visible via SFTP
- Runs Node.js wrapper in foreground via `exec`
- Uses `tini` as PID 1 for zombie reaping
- `OPENCLAW_NO_RESPAWN=1` exported — gateway uses in-process restart

### CORE-4. Dockerfile build chain is sound

> **Updated 2026-03-16**: MongoDB stage removed. `lsof` and `python→python3` symlink added.

Multi-stage build:
1. SFTPGo binary from official slim image (`drakkan/sftpgo:v2.7.0-slim`)
2. OpenClaw from source (git clone → pnpm install → pnpm build → pnpm ui:build)
3. Runtime image with Node 22, SFTPGo, tini, lsof, python3 (+ `python` symlink), sqlite3

`lsof` is required by `openclaw gateway run --force` to detect stale port listeners.
`python` symlink prevents `sh: python: not found` errors in gateway exec tool.

### CORE-5. Railway config-as-code is correct

- `railway.toml` uses `builder = "DOCKERFILE"` (correct — multi-process container)
- Healthcheck on `/setup/healthz` (minimal endpoint, no auth required)
- Volume mount at `/data` with `requiredMountPath`
- `RAILWAY_RUN_UID=0` set in `.env.railway` (required for volume permissions)
- Web service uses `builder = "RAILPACK"` with healthcheck on `/api/health`

### CORE-6. INTERNAL_SERVICE_TOKEN auth mismatch potential

**Web** uses `INTERNAL_SERVICE_TOKEN` from env (shared secret for `coreFetch` Bearer token).
**Core** sets `INTERNAL_SERVICE_TOKEN` in env but **only uses it for the gateway token flow**, not as an API auth layer.

The core service doesn't validate any incoming `Authorization: Bearer` headers on its own routes. It:
- Uses Basic auth for `/setup` routes
- Injects gateway token for proxied requests to OpenClaw gateway

So when web calls `coreFetch('/internal/health')` with `Bearer ${INTERNAL_SERVICE_TOKEN}`, core doesn't even parse it because the route doesn't exist. When/if internal API routes are built, they'll need to validate this token.

### CORE-7. No CORS or rate limiting on core

Not critical since core is internal-only (not public-facing via Railway). But if someone misconfigures networking, the setup endpoints have no rate limiting beyond the Basic auth password.

---

## CROSS-SERVICE INTEGRATION SUMMARY

| Integration Point | Web Side | Core Side | Status |
|-------------------|----------|-----------|--------|
| SQLite (web app data) | `SQLITE_DB_PATH=/data/web.db` | N/A | **WORKS** — self-contained in web volume |
| Auth (NextAuth) | `AUTH_SECRET` → JWT sessions | N/A | **WORKS** — self-contained in web |
| Health probe | `GET /internal/health` via coreFetch | Implemented in `server.js` | **WORKS** — returns wrapper/gateway status |
| Agent skills | `POST /internal/agent/run` via coreFetch | Implemented in `server.js` | **WORKS** — proxies to OpenClaw gateway HTTP API |
| Book reindex | `POST /internal/index/rebuild` via coreFetch | Implemented in `server.js` | **WORKS** — restarts gateway, returns job id |
| SFTP upload | Not wired from web UI | SFTPGo on `:2022`, exposes `/data` | **EXTERNAL** — direct SFTP access, Railway TCP Proxy required |
| OpenClaw gateway | Control UI via wrapper proxy | Loopback `:18789`, proxied on `:8080` | **WORKS** — accessed via core's public domain |

---

## Recommended Fix Order

### Phase 1: Make login-to-library work without 500s
1. **C1** — Add try/catch to all API routes (prevents 500s on first use)
2. **C2** — Add auth guard to book section API
3. **C3** — Fix verifyPassword dead branch
4. **H4** — Add sign-out button (can't test login flow without logout)
5. **M4** — Fix library page error handling

### Phase 2: Make the reading experience work
6. **H2** — Add markdown renderer to book reader
7. **H3** — Wire Previous/Next navigation (depends on TOC data)
8. **M2** — Fix hardcoded section slug in app-shell
9. **M3** — Wire TOC progress (depends on reading data)

### Phase 3: Clean up dead/placeholder code
10. **H1** — Disable or remove placeholder pages from nav
11. **H5** — Remove static filter badges from notes
12. **M1** — Remove dead session code
13. **M5** — Remove unused ObjectId import

### Phase 4: Build core internal API (future — requires design decision)
14. **CORE-1** — Build `/internal/health` endpoint in core
15. **CORE-1** — Build `/internal/agent/run` endpoint in core (requires AI provider integration)
16. **CORE-1** — Build `/internal/index/rebuild` endpoint in core (requires book import pipeline)

**Note on CORE-1**: The three missing internal endpoints are not bugs — they're unfinished integration between a complete web frontend and a core service that was designed for a different purpose (OpenClaw gateway wrapper). Implementing them requires architectural decisions about whether the AI agent skills run inside the core container (Node.js process) or are proxied to the OpenClaw gateway. This is a design conversation, not a fix pass.
