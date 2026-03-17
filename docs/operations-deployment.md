# Operations & Deployment

## Overview

The operations layer provides deterministic workflows for maintaining the OpenClaw deployment. It follows a strict command lifecycle—**Probe, State, Snapshot, Mutate, Verify, Record, Learn**—that prevents blind state mutation and ensures every change is traceable and reversible.

The core container uses a **Node.js wrapper process** as the runtime supervisor. It manages the OpenClaw gateway as a supervised child process with restart backoff, captured stdout/stderr, and health probing. SFTPGo is launched by `entrypoint.sh` before the wrapper starts. `tini` is PID 1 for zombie reaping and clean signal forwarding.

---

## Command Lifecycle

Every operational task follows this sequence:

```
┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐
│  Probe  │ → │  State  │ → │ Snapshot│ → │  Mutate │
└─────────┘   └─────────┘   └─────────┘   └─────────┘
                                              │
┌─────────┐   ┌─────────┐   ┌─────────┐      │
│  Learn  │ ← │  Record │ ← │  Verify │ ←────┘
└─────────┘   └─────────┘   └─────────┘
```

### Phase 1: Probe
Verify basic connectivity and version.

```bash
openclaw --version
# Expected: version string
```

### Phase 2: State
Check current system state.

```bash
openclaw status
openclaw doctor
```

### Phase 3: Snapshot
Capture current state before mutation.

```bash
# Pull remote state
openclaw state export > snapshot-$(date +%Y%m%d-%H%M%S).json
```

### Phase 4: Mutate
Execute the change through controlled helper scripts.

```bash
# Example: deploy new configuration
openclaw config apply --file new-config.yaml
```

### Phase 5: Verify
Confirm the change succeeded.

```bash
openclaw status
openclaw doctor
curl -i https://your-domain/healthz
```

### Phase 6: Record
Log the change for audit.

```bash
# Automatically logged to core-backed audit store
```

### Phase 7: Learn
Update runbooks based on results.

```bash
# Document any new issues or resolutions
```

---

## Core Container Startup

### Process Architecture

The core container runs three processes. `tini` (PID 1) manages signal forwarding and zombie reaping:

```
┌─────────────────────────────────────────┐
│            tini (PID 1)                 │
├─────────────────────────────────────────┤
│   entrypoint.sh                         │
│     └─ SFTPGo (background)  :2022 SFTP  │
│                              :2080 HTTP  │
│     └─ Node.js wrapper (foreground)     │
│           └─ OpenClaw gateway :18789    │
│           └─ QMD (via wrapper)          │
├─────────────────────────────────────────┤
│   Public HTTP: :8080 (Railway PORT)     │
│   Health:      /setup/healthz           │
│                /healthz                 │
└─────────────────────────────────────────┘
```

### Startup Sequence

#### Phase 0 — Volume layout (`runtime-bootstrap.sh`)
1. Symlink `~/.openclaw/workspace` → `/data/workspace`
2. Symlink `~/.claude` → `/data/.claude`
3. Prepare memory search cache and store paths
4. **Fail fast** if `/data` is not mounted

#### Phase 1 — Start SFTPGo (`entrypoint.sh`)
1. Create `/data/sftpgo/srv` and `/data/sftpgo/lib`
2. Symlink SFTPGo asset paths to persistent volume
3. Attempt `sftpgo serve` (full mode)
4. On failure: fall back to `sftpgo portable --directory /data --permissions '*'`
5. SFTPGo runs in background on ports `:2022` (SFTP) and `:2080` (HTTP admin)

#### Phase 2 — Start Node.js wrapper (`entrypoint.sh`)
1. Wrapper starts Express on `$PORT` (Railway injects this)
2. Syncs gateway token, config, and session defaults
3. Spawns OpenClaw gateway subprocess: `openclaw gateway run --force --bind loopback --port 18789`
4. `OPENCLAW_NO_RESPAWN=1` forces in-process restart on config changes (no systemd)
5. `lsof` available for `--force` port cleanup

### Health Endpoints

```
GET /healthz            — public, no auth; Railway healthcheck
GET /setup/healthz      — public, no auth; Railway deployment healthcheck
GET /internal/health    — bearer token required; web→core health probe
```

`/healthz` response shape:
```json
{
  "ok": true,
  "wrapper": { "configured": true, "stateDir": "...", "workspaceDir": "..." },
  "gateway": { "reachable": true, "lastError": null, "lastExit": null },
  "claudeMaxProxy": { "configured": false }
}
```

**Semantics:**
- `ok` is always `true` — degraded gateway does not flip this (web UI reads component fields)
- `gateway.reachable` is the live probe result
- `gateway.lastError` / `lastExit` surface restart failures for diagnostics

---

## Environment Variables

### Core Service

| Variable | Required | Description |
|----------|----------|-------------|
| `SETUP_PASSWORD` | Yes | Protects `/setup` wizard |
| `INTERNAL_SERVICE_TOKEN` | Yes | Shared bearer token for web→core calls |
| `OPENCLAW_GATEWAY_TOKEN` | Yes | Token for OpenClaw gateway auth |
| `OPENCLAW_STATE_DIR` | No | Defaults to `/data/.openclaw` |
| `OPENCLAW_WORKSPACE_DIR` | No | Defaults to `/data/workspace` |
| `OPENCLAW_NO_RESPAWN` | Baked in | `1` — forces in-process gateway restart (no systemd) |
| `SFTPGO_ENABLED` | No | `true` to enable SFTPGo (default: `true`) |
| `SFTPGO_DATA_ROOT` | No | Defaults to `/data/sftpgo` |
| `SFTPGO_PORTABLE_DIRECTORY` | No | Defaults to `/data` (full volume access) |
| `SFTPGO_SFTPD__BINDINGS__0__PORT` | No | SFTP port (default: `2022`) |
| `SFTPGO_HTTPD__BINDINGS__0__PORT` | No | SFTPGo HTTP admin port (default: `2080`) |
| `SFTPGO_DEFAULT_ADMIN_USERNAME` | No | SFTPGo admin username |
| `SFTPGO_DEFAULT_ADMIN_PASSWORD` | Yes | SFTPGo admin password |

### Actual Port Map

```
:8080   — HTTP wrapper (Railway public PORT)
:18789  — OpenClaw gateway (loopback only, not exposed)
:2022   — SFTPGo SFTP (TCP Proxy required in Railway dashboard)
:2080   — SFTPGo HTTP admin (internal only)
:18791  — Browser control server (loopback only)
```

---

## Reindex Operations

### Reindex Job Lifecycle

```
Queued → Running → Succeeded
              ↓
           Failed (retryable)
```

### Start Reindex

```http
POST /internal/index/rebuild
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "scope": "book",
  "version": 2,
  "dryRun": false
}

Response:
{
  "started": true,
  "jobId": "job-abc-123"
}
```

### Check Status

```http
GET /internal/index/status?jobId=job-abc-123
Authorization: Bearer <jwt>

Response:
{
  "jobId": "job-abc-123",
  "state": "running",  // queued | running | succeeded | failed
  "progress": {
    "total": 100,
    "completed": 45,
    "percent": 45
  },
  "error": null
}
```

### Idempotency

Reindex is safe to call multiple times:
- Duplicate requests return existing jobId if job is in progress
- Completed jobs can be re-triggered
- No data corruption from multiple runs

---

## Gateway Lock Handling

### Lock Contention Scenario

When you see:
```
gateway already running
timeout waiting for gateway
```

### Resolution Procedure

```bash
# Step 1: Probe existing gateway
openclaw gateway probe

# Step 2: If reachable, do not restart
if openclaw gateway probe; then
  echo "Gateway healthy, no action needed"
  exit 0
fi

# Step 3: If not reachable, stop and restart
openclaw gateway stop
sleep 2
openclaw gateway start

# Step 4: Verify
openclaw gateway probe
```

### Container Restart Context

This deployment is container-native — no systemd, no s6-overlay:
- Gateway restarts are managed by the Node.js wrapper's restart loop
- `OPENCLAW_NO_RESPAWN=1` forces in-process restart (no detached spawn)
- To trigger a config-change restart: use `/restart` in chat or the setup admin UI
- Full container restart: Railway dashboard → Redeploy

---

## Validation Gates

Do not proceed to closure unless these pass:

```bash
# 1. Version check
openclaw --version
# Expected: OpenClaw version X.Y.Z

# 2. Status check
openclaw status
# Expected: All components healthy

# 3. Doctor check
openclaw doctor
# Expected: No critical issues

# 4. Setup API status
curl -s https://your-domain/setup/api/status | jq '.configured'
# Expected: true

# 5. Debug endpoint
curl -s https://your-domain/setup/api/debug | jq '.healthy'
# Expected: true
```

---

## Traceability Contract

### Required Fields

Every operation must include:

| Field | Description | Example |
|-------|-------------|---------|
| `traceId` | Unique operation identifier | `trace-20240303-abc123` |
| `severity` | Log level | `INFO`, `WARN`, `ERROR`, `RISK` |
| `phase` | Current lifecycle phase | `probe`, `mutate`, `verify` |
| `nextAction` | Deterministic next step | `retry`, `rollback`, `proceed` |

### Log Format

```json
{
  "timestamp": "2024-03-03T12:00:00Z",
  "traceId": "trace-20240303-abc123",
  "severity": "INFO",
  "phase": "mutate",
  "message": "Starting reindex job",
  "details": {
    "jobId": "job-abc-123",
    "scope": "book"
  },
  "nextAction": "verify"
}
```

### Log Location

```
../srv/logs/
├── openclaw.log          # Main application log
├── access.log            # HTTP access log
├── error.log             # Error log
└── audit/
    └── admin-actions.log # Admin action audit trail
```

---

## Continuity Contract

### Checkpoint File

Path: `../srv/state/continuity.json`

```json
{
  "traceId": "trace-20240303-abc123",
  "tool": "reindex",
  "phase": "mutate",
  "status": "in_progress",
  "details": {
    "jobId": "job-abc-123",
    "progress": 45
  },
  "updatedAtUtc": "2024-03-03T12:00:00Z"
}
```

### Recovery Procedure

If operation is interrupted:

```bash
# 1. Read continuity checkpoint
cat ../srv/state/continuity.json

# 2. Determine recovery action based on phase
# - probe: Restart from beginning
# - mutate: Check current state, resume or rollback
# - verify: Re-run verification

# 3. Resume or clean up
openclaw doctor  # Assess current state
# Take appropriate action based on results
```

---

## Deployment Workflow

### Railway Deployment

```bash
# 1. Build and deploy
railway up

# 2. Run validation gates
./scripts/validate-deployment.sh

# 3. Smoke tests
./scripts/smoke-tests.sh
```

### Docker Build

```bash
# Web service
docker build -f services/web/Dockerfile services/web

# Core service
docker build -f services/core/Dockerfile services/core


```

### Configuration

```bash
# railway.json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "watchPatterns": [
      "railway.json",
      "services/web/**",
      "services/core/**"
    ]
  },
  "deploy": {
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

---

## Troubleshooting

### Core Won't Start

**Check:**
1. Environment variables set
2. Required directories exist and are writable
3. Port conflicts (check if ports already in use)
4. QMD health endpoint responding

**Commands:**
```bash
# Check Railway logs
railway logs --service openclaw-core

# Check environment inside container
openclaw doctor
openclaw status

# Manual health check
curl http://localhost:8080/healthz          # wrapper + gateway status
curl http://localhost:8080/setup/healthz    # Railway healthcheck endpoint
```

### Reindex Fails

**Check:**
1. Core service healthy
2. Core-backed data store reachable
3. Sufficient disk space
4. Book content valid

**Recovery:**
```bash
# Check job status
curl "http://core.railway.internal:8080/internal/index/status?jobId=job-abc-123"

# Retry reindex
curl -X POST http://core.railway.internal:8080/internal/index/rebuild
```

### Gateway Lock Issues

**Resolution:**
```bash
# Check if gateway actually running
openclaw gateway probe

# Force restart if needed
openclaw gateway stop --force
openclaw gateway start
```

---

## Operational Checklist

### Daily
- [ ] Check system status: `openclaw status`
- [ ] Review error logs
- [ ] Verify backup completion

### Weekly
- [ ] Review audit logs
- [ ] Check disk usage
- [ ] Verify rate limit effectiveness

### Monthly
- [ ] Rotate JWT keys
- [ ] Review and update runbooks
- [ ] Test disaster recovery procedures
- [ ] Performance review

### Deployment
- [ ] Run validation gates
- [ ] Execute smoke tests
- [ ] Monitor error rates
- [ ] Verify all services healthy

---

*For more details, see the [Service Architecture](./service-architecture.md) and [Internal Service Auth](./internal-service-auth.md) documentation.*
