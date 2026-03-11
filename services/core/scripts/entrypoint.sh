#!/bin/bash
set -euo pipefail

# =============================================================================
# OpenClaw Core Entrypoint (MVP — Consolidated)
# Starts SFTPGo, then the Node.js wrapper.
# All data persists on the single Railway volume at /data.
# DECISION_197: MongoDB removed — web service uses embedded SQLite.
# =============================================================================

echo "[entrypoint] Runtime UID:GID $(id -u):$(id -g)"

export OPENCLAW_DATA_ROOT="${OPENCLAW_DATA_ROOT:-/data}"
export OPENCLAW_STATE_DIR="${OPENCLAW_STATE_DIR:-${OPENCLAW_DATA_ROOT}/.openclaw}"
export OPENCLAW_WORKSPACE_VOLUME_DIR="${OPENCLAW_WORKSPACE_VOLUME_DIR:-${OPENCLAW_DATA_ROOT}/workspace}"
export OPENCLAW_WORKSPACE_DIR="${OPENCLAW_WORKSPACE_DIR:-${OPENCLAW_WORKSPACE_VOLUME_DIR}}"
export OPENCLAW_MEMORY_QMD_COMMAND="${OPENCLAW_MEMORY_QMD_COMMAND:-qmd}"

SFTPGO_LOG_DIR="${SFTPGO_LOG_DIR:-${OPENCLAW_DATA_ROOT}/log}"
mkdir -p "${SFTPGO_LOG_DIR}"

echo "[entrypoint] Preparing persistent runtime layout"
bash /app/scripts/runtime-bootstrap.sh prepare

if [ "${OPENCLAW_QMD_WARM_ON_BOOT:-true}" = "true" ]; then
  echo "[entrypoint] Starting best-effort QMD warmup in background"
  bash /app/scripts/runtime-bootstrap.sh warm-qmd > "${SFTPGO_LOG_DIR}/qmd-warmup.log" 2>&1 &
fi

# ---------------------------------------------------------------------------
# SFTPGo
# ---------------------------------------------------------------------------
# SFTPGo provides SFTP on port 2022 for book content upload.
# The web admin UI listens on port 2080 (internal only — reachable via private networking).
# To expose SFTP externally, enable TCP Proxy on port 2022 in Railway dashboard.
SFTPGO_ENABLED="${SFTPGO_ENABLED:-true}"
SFTPGO_DATA_ROOT="${SFTPGO_DATA_ROOT:-/data/sftpgo}"
SFTPGO_SFTP_PORT="${SFTPGO_SFTPD__BINDINGS__0__PORT:-2022}"
SFTPGO_HTTP_PORT="${SFTPGO_HTTPD__BINDINGS__0__PORT:-2080}"

if [ "$SFTPGO_ENABLED" = "true" ] && command -v sftpgo >/dev/null 2>&1; then
  SRV_DIR="${SFTPGO_DATA_ROOT}/srv"
  LIB_DIR="${SFTPGO_DATA_ROOT}/lib"
  mkdir -p "$SRV_DIR" "$LIB_DIR" "$SFTPGO_LOG_DIR"

  # Symlink default SFTPGo assets to the persistent volume so host keys survive restarts.
  if [ -d /srv/sftpgo ] && [ ! -L /srv/sftpgo ]; then
    if [ -z "$(ls -A "${SRV_DIR}" 2>/dev/null || true)" ]; then
      cp -a /srv/sftpgo/. "${SRV_DIR}/" 2>/dev/null || true
    fi
    rm -rf /srv/sftpgo
  fi
  ln -sf "${SRV_DIR}" /srv/sftpgo

  if [ -d /var/lib/sftpgo ] && [ ! -L /var/lib/sftpgo ]; then
    if [ -z "$(ls -A "${LIB_DIR}" 2>/dev/null || true)" ]; then
      cp -a /var/lib/sftpgo/. "${LIB_DIR}/" 2>/dev/null || true
    fi
    rm -rf /var/lib/sftpgo
  fi
  ln -sf "${LIB_DIR}" /var/lib/sftpgo

  echo "[entrypoint] Starting SFTPGo (SFTP: ${SFTPGO_SFTP_PORT}, HTTP admin: ${SFTPGO_HTTP_PORT})"

  # Export SFTPGo config via env vars (overrides any config file).
  export SFTPGO_SFTPD__BINDINGS__0__PORT="${SFTPGO_SFTP_PORT}"
  export SFTPGO_SFTPD__BINDINGS__0__ADDRESS=""
  export SFTPGO_HTTPD__BINDINGS__0__PORT="${SFTPGO_HTTP_PORT}"
  export SFTPGO_HTTPD__BINDINGS__0__ADDRESS=""
  export SFTPGO_DATA_PROVIDER__CREATE_DEFAULT_ADMIN="${SFTPGO_DATA_PROVIDER__CREATE_DEFAULT_ADMIN:-true}"
  export SFTPGO_PORTABLE_DIRECTORY="${SFTPGO_PORTABLE_DIRECTORY:-${OPENCLAW_WORKSPACE_DIR}}"

  # Start SFTPGo in the background, logging to the shared log directory.
  # If full serve fails (for example missing embedded templates in slim image),
  # fall back to portable mode so SFTP upload remains operational.
  start_portable_sftpgo() {
    PORTABLE_USER="${SFTPGO_PORTABLE_USERNAME:-${SFTPGO_DEFAULT_ADMIN_USERNAME:-book-uploader}}"
    PORTABLE_PASS="${SFTPGO_PORTABLE_PASSWORD:-${SFTPGO_DEFAULT_ADMIN_PASSWORD:-change-me-now}}"
    PORTABLE_DIR="${SFTPGO_PORTABLE_DIRECTORY:-${OPENCLAW_WORKSPACE_DIR}}"
    mkdir -p "$PORTABLE_DIR"

    sftpgo portable \
      --directory "$PORTABLE_DIR" \
      --sftpd-port "$SFTPGO_SFTP_PORT" \
      --httpd-port -1 \
      --webdav-port -1 \
      --ftpd-port -1 \
      --username "$PORTABLE_USER" \
      --password "$PORTABLE_PASS" \
      --permissions '*' \
      > "$SFTPGO_LOG_DIR/sftpgo.log" 2>&1 &

    SFTPGO_PID=$!
    echo "[entrypoint] SFTPGo portable mode started (PID: ${SFTPGO_PID}, user: ${PORTABLE_USER}, dir: ${PORTABLE_DIR})"
  }

  sftpgo serve -c /srv/sftpgo > "$SFTPGO_LOG_DIR/sftpgo.log" 2>&1 &
  SFTPGO_PID=$!
  sleep 2

  if kill -0 "$SFTPGO_PID" 2>/dev/null && sftpgo ping >/dev/null 2>&1; then
    echo "[entrypoint] SFTPGo started (PID: ${SFTPGO_PID})"
  else
    echo "[entrypoint] SFTPGo full mode failed, starting portable SFTP fallback"
    if kill -0 "$SFTPGO_PID" 2>/dev/null; then
      kill "$SFTPGO_PID" 2>/dev/null || true
      sleep 1
    fi
    start_portable_sftpgo
  fi
else
  echo "[entrypoint] SFTPGo disabled or not installed — skipping"
fi

# ---------------------------------------------------------------------------
# Node.js wrapper (foreground)
# ---------------------------------------------------------------------------
echo "[entrypoint] Starting Node.js wrapper..."
exec node src/server.js
