# OpenClaw Core Service Dockerfile
# Consolidated: OpenClaw + MongoDB + QMD + SFTPGo wrapper
# All persistent data stored on a single Railway volume at /data (500MB free plan)
#
# Railway Configuration Notes:
# - Requires a volume mounted at /data for persistence
# - Healthchecks use /setup/healthz endpoint
# - RAILWAY_RUN_UID=0 is set in railway.toml for volume permissions
#
# Volume layout (/data):
#   /data/db              — MongoDB data files
#   /data/.openclaw       — OpenClaw state and config
#   /data/workspace       — OpenClaw workspace
#   /data/npm             — Persistent npm global installs
#   /data/pnpm            — Persistent pnpm binaries
#   /data/book-source     — Book content staging (optional)
# =============================================================================

# =============================================================================
# Stage 1: Build OpenClaw from source
# =============================================================================
FROM node:22-bookworm AS openclaw-build

# Dependencies needed for openclaw build
RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    git \
    ca-certificates \
    curl \
    python3 \
    make \
    g++ \
  && rm -rf /var/lib/apt/lists/*

# Install Bun (openclaw build uses it)
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

RUN corepack enable

WORKDIR /openclaw

# Pin to a known-good ref (tag/branch). Override in Railway template settings if needed.
# Using a released tag avoids build breakage when `main` temporarily references unpublished packages.
ARG OPENCLAW_GIT_REF=v2026.2.9
RUN git clone --depth 1 --branch "${OPENCLAW_GIT_REF}" https://github.com/openclaw/openclaw.git .

# Patch: relax version requirements for packages that may reference unpublished versions.
# Apply to all extension package.json files to handle workspace protocol (workspace:*).
RUN set -eux; \
  find ./extensions -name 'package.json' -type f | while read -r f; do \
    sed -i -E 's/"openclaw"[[:space:]]*:[[:space:]]*">=[^"]+"/"openclaw": "*"/g' "$f"; \
    sed -i -E 's/"openclaw"[[:space:]]*:[[:space:]]*"workspace:[^"]+"/"openclaw": "*"/g' "$f"; \
  done

RUN pnpm install --no-frozen-lockfile
RUN pnpm build
ENV OPENCLAW_PREFER_PNPM=1
RUN pnpm ui:install && pnpm ui:build

# =============================================================================
# Stage 2: Runtime Image (Node.js + MongoDB consolidated)
# =============================================================================
FROM node:22-bookworm

ENV NODE_ENV=production

# Install MongoDB 7.0 community server (standalone, no replica set needed)
# Uses the official MongoDB apt repository for Debian Bookworm
# Only install mongod (server), mongosh (shell), and tools — skip mongos (sharding router)
RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    gnupg \
  && curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | \
    gpg --dearmor -o /usr/share/keyrings/mongodb-server-7.0.gpg \
  && echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] http://repo.mongodb.org/apt/debian bookworm/mongodb-org/7.0 main" | \
    tee /etc/apt/sources.list.d/mongodb-org-7.0.list \
  && apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    mongodb-org-server \
    mongodb-org-tools \
    mongodb-mongosh \
  && rm -rf /var/lib/apt/lists/*

# Install other runtime dependencies
RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    tini \
    python3 \
    python3-venv \
    bash \
  && rm -rf /var/lib/apt/lists/*

# `openclaw update` expects pnpm. Provide it in the runtime image.
RUN corepack enable && corepack prepare pnpm@10.23.0 --activate

# Persist user-installed tools by default by targeting the Railway volume.
# - npm global installs -> /data/npm
# - pnpm global installs -> /data/pnpm (binaries) + /data/pnpm-store (store)
ENV NPM_CONFIG_PREFIX=/data/npm
ENV NPM_CONFIG_CACHE=/data/npm-cache
ENV PNPM_HOME=/data/pnpm
ENV PNPM_STORE_DIR=/data/pnpm-store
ENV PATH="/data/npm/bin:/data/pnpm:${PATH}"

WORKDIR /app

# Wrapper deps
COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force

# Copy built openclaw
COPY --from=openclaw-build /openclaw /openclaw

# Provide an openclaw executable
RUN printf '%s\n' '#!/usr/bin/env bash' 'exec node /openclaw/dist/entry.js "$@"' > /usr/local/bin/openclaw \
  && chmod +x /usr/local/bin/openclaw

COPY src ./src
COPY scripts ./scripts

# =============================================================================
# Railway Port Configuration
# =============================================================================
# IMPORTANT: Do not set a default PORT here.
# Railway injects PORT at runtime and routes traffic to that port.
# The service should listen on 0.0.0.0:$PORT or ::$PORT for healthchecks.
# Healthcheck endpoint: /setup/healthz (configured in railway.toml)
# =============================================================================

EXPOSE 8080

# Ensure PID 1 reaps zombies and forwards signals.
ENTRYPOINT ["tini", "--"]
CMD ["bash", "/app/scripts/entrypoint.sh"]
