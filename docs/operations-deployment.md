# Operations & Deployment

## Overview

The operations layer provides deterministic workflows for maintaining the OpenClaw deployment. It follows a strict command lifecycle—**Probe, State, Snapshot, Mutate, Verify, Record, Learn**—that prevents blind state mutation and ensures every change is traceable and reversible.

The core container uses `s6-overlay` as a process supervisor to manage OpenClaw, QMD, and SFTPGo with proper startup sequencing, health checks, and graceful shutdown.

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

The core service runs multiple processes under `s6-overlay`:

```
┌─────────────────────────────────────┐
│         s6-overlay (PID 1)          │
├─────────────┬─────────────┬─────────┤
│    QMD      │  OpenClaw   │ SFTPGo  │
│   :7100     │   :7200     │ :7300   │
├─────────────┴─────────────┴─────────┤
│         Aggregate Health            │
│              :7000                  │
└─────────────────────────────────────┘
```

### Startup Sequence

#### Phase 0 — Init
1. Load configs from environment + mounted config directory
2. Ensure writable paths exist (indexes, uploads, logs)
3. Validate required environment variables
4. **Fail fast** if validation fails

#### Phase 1 — Start QMD
1. Start QMD process
2. Wait for health endpoint: `GET /health` returns 200
3. Optional: Verify `GET /ready` confirms index availability
4. **Timeout:** 60 seconds
5. **On failure:** Mark degraded but continue booting

#### Phase 2 — Start OpenClaw
1. Start OpenClaw process
2. Configure with:
   - QMD base URL (internal loopback)
   - Service auth verification (token/JWT)
3. Wait for health endpoint: `GET /health` returns 200

#### Phase 3 — Start SFTPGo
1. Start SFTPGo process
2. Ensure access to persistence directory
3. No blocking health check required

### Health Endpoints

#### Aggregate Health
```http
GET /internal/health
Authorization: Bearer <jwt>

Response:
{
  "ok": true,
  "components": {
    "qmd": "ok",
    "agent": "ok",
    "sftpgo": "ok"
  }
}
```

**Semantics:**
- `ok: true` only when OpenClaw and QMD are healthy
- If one component fails: return 200 with `ok: false` and component states
- Never "hang"—Web UI must be able to display status

---

## Environment Variables

### Core Service

| Variable | Required | Description |
|----------|----------|-------------|
| `INTERNAL_SERVICE_TOKEN` | Yes* | Shared secret (if not using JWT) |
| `INTERNAL_JWT_VERIFY_KEYS` | Yes* | JSON array of JWT verification keys |
| `SETUP_PASSWORD` | Yes | Secure setup password |
| `OPENCLAW_STATE_DIR` | Yes | State directory path |
| `OPENCLAW_WORKSPACE_DIR` | Yes | Workspace directory path |
| `OPENCLAW_GATEWAY_TOKEN` | Yes | Gateway token |
| `QMD_PORT` | No | QMD port (default: 7100) |
| `OPENCLAW_PORT` | No | OpenClaw port (default: 7200) |
| `SFTPGO_PORT` | No | SFTPGo port (default: 7300) |

*One of `INTERNAL_SERVICE_TOKEN` or `INTERNAL_JWT_VERIFY_KEYS` required.

### Port Configuration

```bash
# Default ports
QMD_PORT=7100
OPENCLAW_PORT=7200
SFTPGO_PORT=7300
HEALTH_PORT=7000  # Optional aggregate health
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

### Non-Systemd Contexts

In Docker/non-systemd environments:
- Service stop failures are **non-fatal** if probe is healthy
- Focus on process health, not systemd state
- Use `s6-svc` commands if using s6-overlay

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
# Check logs
docker logs core-service

# Check environment
openclaw doctor

# Manual health check
curl http://localhost:7100/health  # QMD
curl http://localhost:7200/health  # OpenClaw
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
curl "http://core:7200/internal/index/status?jobId=job-abc-123"

# Retry reindex
curl -X POST http://core:7200/internal/index/rebuild
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
