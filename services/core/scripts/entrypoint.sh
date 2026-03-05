#!/bin/bash
set -eu

# =============================================================================
# OpenClaw Core Entrypoint (MVP — Consolidated)
# Starts MongoDB, SFTPGo, then the Node.js wrapper.
# All data persists on the single Railway volume at /data.
# =============================================================================

# ---------------------------------------------------------------------------
# MongoDB
# ---------------------------------------------------------------------------
MONGO_DATA_DIR="${MONGO_DATA_DIR:-/data/db}"
MONGO_LOG_DIR="${MONGO_LOG_DIR:-/data/log}"
MONGO_PORT="${MONGO_PORT:-27017}"
# Default: ::,0.0.0.0 — required for Railway private networking (IPv6+IPv4).
# See: https://docs.railway.com/networking/private-networking/library-configuration
MONGO_BIND_IP="${MONGO_BIND_IP:-::,0.0.0.0}"
MONGO_WT_CACHE_GB="${MONGO_WT_CACHE_GB:-0.25}"

mkdir -p "$MONGO_DATA_DIR" "$MONGO_LOG_DIR"
chown -R "$(id -u)":"$(id -g)" "$MONGO_DATA_DIR" "$MONGO_LOG_DIR" 2>/dev/null || true

echo "[entrypoint] Runtime UID:GID $(id -u):$(id -g)"

echo "[entrypoint] Starting MongoDB on ${MONGO_BIND_IP}:${MONGO_PORT} (data: ${MONGO_DATA_DIR})"

# Railway docs baseline: mongod --ipv6 --bind_ip ::,0.0.0.0 --setParameter diagnosticDataCollectionEnabled=false
# Use background process (instead of --fork) for better container log visibility.
mongod \
  --dbpath "$MONGO_DATA_DIR" \
  --port "$MONGO_PORT" \
  --bind_ip "$MONGO_BIND_IP" \
  --ipv6 \
  --wiredTigerCacheSizeGB "$MONGO_WT_CACHE_GB" \
  --setParameter diagnosticDataCollectionEnabled=false \
  --noauth \
  > "$MONGO_LOG_DIR/mongod.log" 2>&1 &

MONGOD_PID=$!
echo "[entrypoint] MongoDB launched (PID: ${MONGOD_PID}, WT cache: ${MONGO_WT_CACHE_GB}GB)"

# Wait for MongoDB to be ready
MONGO_WAIT_RETRIES=30
for i in $(seq 1 $MONGO_WAIT_RETRIES); do
  if mongosh --host 127.0.0.1 --port "$MONGO_PORT" --eval "db.adminCommand('ping')" --quiet >/dev/null 2>&1; then
    echo "[entrypoint] MongoDB ready (attempt $i)"
    break
  fi
  if [ "$i" -eq "$MONGO_WAIT_RETRIES" ]; then
    echo "[entrypoint] ERROR: MongoDB did not start in time"
    tail -30 "$MONGO_LOG_DIR/mongod.log"
    exit 1
  fi
  sleep 1
done

export MONGODB_URI="${MONGODB_URI:-mongodb://127.0.0.1:${MONGO_PORT}/openclaw}"
echo "[entrypoint] MONGODB_URI=${MONGODB_URI}"

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
SFTPGO_LOG_DIR="${SFTPGO_LOG_DIR:-/data/log}"

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

  # Start SFTPGo in the background, logging to the shared log directory.
  sftpgo serve > "$SFTPGO_LOG_DIR/sftpgo.log" 2>&1 &
  SFTPGO_PID=$!
  echo "[entrypoint] SFTPGo started (PID: ${SFTPGO_PID})"
else
  echo "[entrypoint] SFTPGo disabled or not installed — skipping"
fi

# ---------------------------------------------------------------------------
# Node.js wrapper (foreground)
# ---------------------------------------------------------------------------
echo "[entrypoint] Starting Node.js wrapper..."
exec node src/server.js
