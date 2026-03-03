#!/bin/bash
set -eu

# =============================================================================
# OpenClaw Core Entrypoint (Consolidated)
# Starts MongoDB as a background process, then runs the Node.js wrapper.
# All data persists on the single Railway volume at /data.
# =============================================================================

MONGO_DATA_DIR="${MONGO_DATA_DIR:-/data/db}"
MONGO_LOG_DIR="${MONGO_LOG_DIR:-/data/log}"
MONGO_PORT="${MONGO_PORT:-27017}"
# MONGO_BIND_IP controls which addresses mongod listens on.
# Default: ::,0.0.0.0 — required for Railway private networking (IPv6+IPv4).
# See: https://docs.railway.com/networking/private-networking/library-configuration
MONGO_BIND_IP="${MONGO_BIND_IP:-::,0.0.0.0}"

# --- Prepare MongoDB directories ---
mkdir -p "$MONGO_DATA_DIR" "$MONGO_LOG_DIR"

echo "[entrypoint] Starting MongoDB on ${MONGO_BIND_IP}:${MONGO_PORT} (data: ${MONGO_DATA_DIR})"

# --- Start MongoDB as a background process ---
# WiredTiger cache is capped at 128MB to leave room for Node.js and OpenClaw on 500MB volume.
# --ipv6 is required when binding to :: (Railway private network uses IPv6).
mongod \
  --dbpath "$MONGO_DATA_DIR" \
  --port "$MONGO_PORT" \
  --bind_ip "$MONGO_BIND_IP" \
  --ipv6 \
  --logpath "$MONGO_LOG_DIR/mongod.log" \
  --logappend \
  --wiredTigerCacheSizeGB 0.125 \
  --noauth \
  --fork

# --- Wait for MongoDB to be ready ---
# Connect via localhost for health checks (mongod listens on all interfaces).
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

# --- Export MONGODB_URI for the wrapper process ---
# Standalone mongod (no replica set). The application code does not use change
# streams or multi-document transactions, so a replica set is unnecessary
# overhead on a single-node free-plan deployment. If you later need change
# streams, add --replSet rs0 to the mongod flags above and uncomment the
# rs.initiate() block in this script.
export MONGODB_URI="${MONGODB_URI:-mongodb://127.0.0.1:${MONGO_PORT}/openclaw}"

echo "[entrypoint] MONGODB_URI=${MONGODB_URI}"
echo "[entrypoint] Starting Node.js wrapper..."

# --- Start the Node.js wrapper (foreground) ---
exec node src/server.js
