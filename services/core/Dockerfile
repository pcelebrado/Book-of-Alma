# OpenClaw Core Service Dockerfile (MVP)
# Consolidated: OpenClaw + QMD + SFTPGo — all in one container
# DECISION_197: MongoDB removed — web service uses embedded SQLite.
# All persistent data stored on a single Railway volume at /data (500MB free plan)
#
# Railway Configuration Notes:
# - Requires a volume mounted at /data for persistence
# - Healthchecks use /setup/healthz endpoint
# - RAILWAY_RUN_UID=0 is set in railway.toml for volume permissions
# - TCP Proxy must be enabled in Railway dashboard for SFTP (port 2022)
# - Set PORT=8080 in service variables when TCP proxy is enabled
#
# Volume layout (/data):
#   /data/.openclaw       — OpenClaw state and config
#   /data/workspace       — OpenClaw workspace
#   /data/log             — Service logs
#   /data/npm             — Persistent npm global installs
#   /data/pnpm            — Persistent pnpm binaries
#   /data/book-source     — Book content staging (optional)
#   /data/sftpgo          — SFTPGo state, host keys, user data
# =============================================================================

# =============================================================================
# Stage 1a: Pull SFTPGo binary from official image
# =============================================================================
FROM drakkan/sftpgo:v2.7.0-slim AS sftpgo-bin

# =============================================================================
# Stage 1b: Build OpenClaw from source
# =============================================================================
FROM node:24-bookworm AS openclaw-build

# Dependencies needed for openclaw build
RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    git \
    ca-certificates \
    curl \
    python3 \
    cmake \
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
ARG OPENCLAW_GIT_REF=v2026.3.13-1
RUN git clone --depth 1 --branch "${OPENCLAW_GIT_REF}" https://github.com/openclaw/openclaw.git .

# Patch: relax version requirements for packages that may reference unpublished versions.
# Apply to all extension package.json files to handle workspace protocol (workspace:*).
RUN set -eux; \
  find ./extensions -name 'package.json' -type f | while read -r f; do \
    sed -i -E 's/"openclaw"[[:space:]]*:[[:space:]]*">=[^"]+"/"openclaw": "*"/g' "$f"; \
    sed -i -E 's/"openclaw"[[:space:]]*:[[:space:]]*"workspace:[^"]+"/"openclaw": "*"/g' "$f"; \
  done

RUN node -e "const fs=require('fs'); const pkg=JSON.parse(fs.readFileSync('package.json','utf8')); const existing=Array.isArray(pkg.pnpm?.onlyBuiltDependencies)?pkg.pnpm.onlyBuiltDependencies:[]; pkg.pnpm={...(pkg.pnpm||{}), onlyBuiltDependencies:[...new Set([...existing,'node-llama-cpp'])]}; fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\\n');"

RUN pnpm install --no-frozen-lockfile
RUN pnpm build
ENV OPENCLAW_PREFER_PNPM=1
RUN pnpm ui:install && pnpm ui:build

# =============================================================================
# Stage 2: Runtime Image (Node.js + SFTPGo consolidated)
# DECISION_197: MongoDB removed — web service uses embedded SQLite.
# =============================================================================
FROM node:24-bookworm

ENV NODE_ENV=production

# Copy SFTPGo binary and default assets from the official image
COPY --from=sftpgo-bin /usr/local/bin/sftpgo /usr/local/bin/sftpgo
COPY --from=sftpgo-bin /srv/sftpgo /srv/sftpgo
COPY --from=sftpgo-bin /var/lib/sftpgo /var/lib/sftpgo

# Install runtime dependencies
# lsof is required by `openclaw gateway run --force` to detect/kill stale port listeners.
# Without it, --force falls back to fuser (also absent) and fails.
RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    tini \
    lsof \
    python3 \
    python3-venv \
    bash \
    sqlite3 \
  && rm -rf /var/lib/apt/lists/*

# `openclaw update` expects pnpm. Provide it in the runtime image.
RUN corepack enable && corepack prepare pnpm@10.23.0 --activate

# QMD runtime dependency for OpenClaw memory backend.
# Install Bun only to fetch qmd and keep `qmd` available on PATH.
RUN curl -fsSL https://bun.sh/install | bash \
  && /root/.bun/bin/bun install -g @tobilu/qmd \
  && ln -sf /root/.bun/bin/bun /usr/local/bin/bun \
  && printf '%s\n' '#!/usr/bin/env bash' 'exec /root/.bun/install/global/node_modules/@tobilu/qmd/bin/qmd "$@"' > /usr/local/bin/qmd \
  && chmod +x /usr/local/bin/qmd

# Claude Max API Proxy support:
# - Claude Code CLI provides the user-authenticated Claude subscription session
# - claude-max-api-proxy exposes that session as a local OpenAI-compatible endpoint
RUN npm install -g @anthropic-ai/claude-code claude-max-api-proxy

# Persist user-installed tool binaries on the Railway volume, but keep caches
# ephemeral so cache churn does not consume persistent storage.
# - npm global installs -> /data/npm
# - pnpm global installs -> /data/pnpm (binaries)
# - npm/pnpm caches -> /tmp (ephemeral)
ENV NPM_CONFIG_PREFIX=/data/npm
ENV NPM_CONFIG_CACHE=/tmp/npm-cache
ENV PNPM_HOME=/data/pnpm
ENV PNPM_STORE_DIR=/tmp/pnpm-store
ENV PATH="/data/npm/bin:/data/pnpm:${PATH}"
ENV OPENCLAW_DATA_ROOT=/data
ENV OPENCLAW_STATE_DIR=/data/.openclaw
ENV OPENCLAW_CLAUDE_STATE_DIR=/data/.claude
ENV OPENCLAW_WORKSPACE_VOLUME_DIR=/data/workspace
ENV OPENCLAW_WORKSPACE_DIR=/data/workspace
ENV OPENCLAW_MEMORY_BACKEND=qmd
ENV OPENCLAW_MEMORY_QMD_COMMAND=/root/.bun/install/global/node_modules/@tobilu/qmd/bin/qmd
ENV DISABLE_AUTOUPDATER=1
ENV OPENCLAW_MEMORY_SEARCH_LOCAL_MODEL_PATH=hf:ggml-org/embeddinggemma-300m-qat-q8_0-GGUF/embeddinggemma-300m-qat-Q8_0.gguf
ENV OPENCLAW_MEMORY_SEARCH_LOCAL_MODEL_CACHE_DIR=/data/.openclaw/models/node-llama-cpp
ENV SFTPGO_PORTABLE_DIRECTORY=/data/workspace
# Force in-process restart on config changes. Without this, the gateway's
# restart logic tries systemctl (systemd) which doesn't exist in containers.
# OPENCLAW_NO_RESPAWN=1 tells the run-loop to re-initialize the server within
# the same process instead of spawning a new child or delegating to systemd.
ENV OPENCLAW_NO_RESPAWN=1
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
COPY workspace-seed ./workspace-seed

# =============================================================================
# Railway Port Configuration
# =============================================================================
# IMPORTANT: Do not set a default PORT here.
# Railway injects PORT at runtime and routes traffic to that port.
# The service should listen on 0.0.0.0:$PORT or ::$PORT for healthchecks.
# Healthcheck endpoint: /setup/healthz (configured in railway.toml)
# =============================================================================

# HTTP (OpenClaw wrapper) + SFTP (SFTPGo)
EXPOSE 8080
EXPOSE 2022

# Ensure PID 1 reaps zombies and forwards signals.
ENTRYPOINT ["tini", "--"]
CMD ["bash", "/app/scripts/entrypoint.sh"]
