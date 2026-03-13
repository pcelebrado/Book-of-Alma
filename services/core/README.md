# OpenClaw Core — Railway Template

An **OpenClaw** wrapper service for Railway. Packages OpenClaw Gateway + Control UI
with a browser-based setup wizard for zero-CLI deployment.

## What you get

- **OpenClaw Gateway + Control UI** — served at `/` and `/openclaw`
- **Setup Wizard** at `/setup` — password-protected browser onboarding
- **Persistent state** via Railway Volume — config, credentials, and memory survive redeploys
- **Backup / restore** — export and import from `/setup`
- **Debug console** — allowlisted safe commands for troubleshooting without SSH
- **Multi-provider model support** — OpenAI, Anthropic, Claude Max API Proxy, Google, OpenRouter, Moonshot, and more
- **Channel support** — Telegram, Discord, Slack configured via wizard

## Architecture

This is **Service B** in the OpenClaw Railway deployment:

```
Browser → [web] (public) → [core] (internal, this service)
                                    ├── OpenClaw Gateway
                                    ├── QMD (vector search)
                                    └── Setup wizard + debug console
```

- This service is **internal only** — no public HTTP exposure.
- The web service calls core endpoints with `INTERNAL_SERVICE_TOKEN`.
- All `/internal/*` endpoints require `Authorization: Bearer <token>`.

## Deploy on Railway

1. Create a new Railway project from this repo
2. Add a **Volume** mounted at `/data`
3. Set environment variables:
   - `SETUP_PASSWORD` — password for the `/setup` wizard and Control UI
   - `OPENCLAW_STATE_DIR=/data/.openclaw` (recommended)
   - `OPENCLAW_WORKSPACE_DIR=/data/workspace` (recommended active path)
   - `OPENCLAW_WORKSPACE_VOLUME_DIR=/data/workspace` (recommended persistent path)
    - `OPENCLAW_GATEWAY_TOKEN` — auth token (auto-generated if not set)
    - `INTERNAL_SERVICE_TOKEN` — must match the web service value
    - `PORT=8080` — required when TCP Proxy is enabled for SFTP on 2022
    - `SFTPGO_DEFAULT_ADMIN_USERNAME` / `SFTPGO_DEFAULT_ADMIN_PASSWORD`
    - `SFTPGO_PORTABLE_USERNAME` / `SFTPGO_PORTABLE_PASSWORD` (optional overrides; if blank, portable mode reuses the admin credentials)
    - `SFTPGO_PORTABLE_DIRECTORY=/data/workspace`
4. **Disable Public Networking** — this service is internal only
5. Deploy
6. Complete setup via the web service's admin panel or direct internal access

## Build

The Dockerfile builds OpenClaw from source (pinned to a release tag via `OPENCLAW_GIT_REF`)
and packages it with the Node.js wrapper.

```bash
docker build -t openclaw-core .
docker run --rm -p 8080:8080 \
  -e PORT=8080 \
  -e SETUP_PASSWORD=test \
  -e OPENCLAW_STATE_DIR=/data/.openclaw \
  -e OPENCLAW_WORKSPACE_DIR=/data/workspace \
  -e OPENCLAW_WORKSPACE_VOLUME_DIR=/data/workspace \
  -v $(pwd)/.tmpdata:/data \
  openclaw-core
```

## Persistence (Railway volume)

Railway containers have an ephemeral filesystem. Only the mounted volume at `/data` persists.

What persists:
- **OpenClaw config and credentials** — `/data/.openclaw/`
- **Active agent workspace** — `/data/workspace/`
- **Compatibility workspace path** — `/root/.openclaw/workspace` (symlink to `/data/workspace`)
- **QMD sqlite index** — `/data/.openclaw/agents/main/qmd/xdg-cache/qmd/index.sqlite`
- **Workspace sqlite pointers** — `/data/workspace/SQLITE_SOURCES.md`, `/data/workspace/qmd-index.sqlite`
- **Node global tools** — `/data/npm/`, `/data/pnpm/`
- **Python venvs** — create under `/data/`

What does **not** persist:
- `apt-get install` packages (use bootstrap.sh for these)

### Startup invariants

On every boot the service:

- creates `/data/workspace` and `/data/.openclaw`
- migrates or backs up non-symlink `/root/.openclaw/workspace`
- points `/root/.openclaw/workspace -> /data/workspace`
- maps legacy `/workspace -> /data/workspace`
- enforces `700` on `/data/.openclaw` and `/data/.openclaw/credentials`
- seeds `MEMORY.md` plus `memory/YYYY-MM-DD.md` if missing
- persists Claude Code CLI auth under `/data/.claude` and re-links `/root/.claude` there on boot
- keeps Kimi as the primary model with Codex as the default automatic fallback
- fixes heartbeat at every 4 hours with `target=none`
- configures QMD to index `/data/workspace` via `memory.qmd.paths`
- disables OpenClaw's derived default-memory roots so QMD does not try to bind `/data/workspace/MEMORY.md` as a collection root
- disables OpenClaw `memorySearch` for the default agent and seeds the direct QMD retrieval skill instead
- reconciles `auth.profiles` from `/data/.openclaw/agents/main/agent/auth-profiles.json` and config backups so re-onboarding does not silently drop older providers
- syncs the managed OpenClaw control-plane skill and source-of-truth docs into `/data/workspace`
- archives stale Stalwart email guidance so Resend stays the active email control plane
- forces the hosted Railway command/tool profile expected by the live service (`commands.restart=true`, `tools.profile=full`, gateway exec host, cross-context messaging, and agent-to-agent enabled)
- scrubs unsupported `memory.qmd.searchMode` keys on boot for the pinned OpenClaw `v2026.2.9` release
- removes the legacy `memory/railway-alma-verification.md` seed if present
- auto-starts `claude-max-api` when `models.providers.claude-max` is configured, using the persisted Claude CLI login state on the Railway volume

### Claude Max API Proxy

The admin flow now exposes **Anthropic → Claude Max API Proxy (Claude Code login)**.
This is not native Anthropic OAuth. The supported contract from OpenClaw is:

- core launches `claude-max-api` locally on `http://127.0.0.1:3456/v1`
- OpenClaw is configured with `models.providers.claude-max`
- the default model becomes `claude-max/claude-opus-4`
- Claude Code CLI auth is persisted at `/data/.claude`

If the proxy is configured but not usable yet, log into Claude Code once on the
core host:

```bash
claude
```

### Bootstrap hook

If `/data/workspace/bootstrap.sh` exists, the wrapper runs it on startup before
starting the gateway. Use this to initialize persistent install prefixes or venvs.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `disconnected (1008): pairing required` | Pending dashboard device not approved | In Admin, run Approve Pairing (auto-approves pending device requests); or use `openclaw devices list` then `approve <id>` |
| `could not start SFTP server: bind: address already in use` | Core HTTP wrapper and SFTP both bound to 2022 | Set `PORT=8080` on core, keep `SFTPGO_SFTPD__BINDINGS__0__PORT=2022`, redeploy |
| `unauthorized: gateway token mismatch` | Token mismatch between UI and gateway | Re-run setup or set both tokens to same value in config |
| `502 Bad Gateway` | Gateway can't start or can't bind | Ensure volume at `/data`, check Railway logs |
| Repeating `gateway already running (pid ...)` or `Port 18789 is already in use` in logs | A stale gateway child survived a wrapper restart, or `openclaw doctor`/manual gateway commands collided with the wrapper-managed gateway | Use the wrapper-managed restart path only; the current wrapper kills the full gateway process tree on restart and skips `doctor` for reachable-port conflicts |
| `memory_search` returns `disabled:true` | Expected on this template unless you explicitly re-enable OpenClaw memorySearch | Use `bash /data/workspace/tools/admin/qmd-rescan.sh` and `python3 /data/workspace/skills/qmd-retrieval/scripts/qmd_memory_search.py --query "<text>"` for workspace recall |
| `qmd ... ENOTDIR: not a directory, scandir '/data/workspace/MEMORY.md'` | OpenClaw derived a file-root default-memory collection and QMD `2.0.x` rejected it | Set `OPENCLAW_MEMORY_QMD_INCLUDE_DEFAULT_MEMORY=false`, keep `memory.qmd.paths` pointed at `/data/workspace`, then redeploy or restart so the gateway reloads the config |
| `memory.qmd: Unrecognized key: "searchMode"` | The current pinned OpenClaw release (`v2026.2.9`) does not support that config key | Remove it with `openclaw doctor --fix`, or redeploy the template so the wrapper scrubs it automatically |
| `sh: 1: python: not found` | The container only guarantees `python3`, not a `python` shim | Run managed scripts with `python3 ...` |
| Claude Max proxy selected but model calls fail | `claude-max-api` is running without a valid Claude Code CLI login, or `claude`/`claude-max-api` is missing | Verify `claude --version`, complete `claude` login once, then check `curl http://127.0.0.1:3456/health` inside core |
| Build OOM | Insufficient memory | Use Railway plan with 2GB+ memory |

## Migration and verification

- Existing deployments: [`MIGRATION.md`](../../MIGRATION.md)
- Post-deploy checks: [`VERIFY.md`](../../VERIFY.md)

## GitHub Actions

- **Docker build** — validates Dockerfile on push/PR
- **Bump OpenClaw ref** — daily check for new OpenClaw releases, auto-creates PR

## Related services

- [`openclaw-web`](https://github.com/pcelebrado/openclaw-web) — Next.js frontend (public)

## License

MIT License — see [LICENSE](LICENSE).
