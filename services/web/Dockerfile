# OpenClaw Web Service Dockerfile
# Multi-stage build for Next.js 14+ with standalone output
# Optimized for Railway deployment with IPv4/IPv6 dual-stack support
# DECISION_197 follow-up: web runtime is fully core-backed

# =============================================================================
# Stage 1: Dependencies
# =============================================================================
FROM node:20-alpine AS deps

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./
RUN npm ci

# =============================================================================
# Stage 2: Builder
# =============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Build-time environment variables
ENV NEXT_TELEMETRY_DISABLED=1

# Copy dependencies from previous stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build the application
RUN npm run build

# =============================================================================
# Stage 3: Runner
# =============================================================================
FROM node:20-alpine AS runner

WORKDIR /app

# Production environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user for security
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

# Create data directory for optional runtime artifacts
RUN mkdir -p /data && chown nextjs:nodejs /data

# Copy built application
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Switch to non-root user
USER nextjs

# Expose port (Railway will override with $PORT)
EXPOSE 3000

# Start the Next.js server
# Note: The start script in package.json includes --hostname :: for IPv6 support
# Railway healthchecks use healthcheck.railway.app hostname
CMD ["node", "server.js"]
