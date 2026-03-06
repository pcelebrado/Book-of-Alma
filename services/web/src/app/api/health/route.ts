/**
 * Health endpoint for Railway probes and service monitoring.
 * DECISION_197: MongoDB → SQLite migration.
 *
 * Returns service readiness without exposing secrets.
 */
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const checks: Record<string, string> = {
    status: 'ok',
    service: 'web',
    timestamp: new Date().toISOString(),
  };

  // Check SQLite connectivity (non-blocking, best-effort)
  try {
    const { isDbHealthy } = await import('@/lib/db/sqlite');
    checks.sqlite = isDbHealthy() ? 'connected' : 'unreachable';
  } catch {
    checks.sqlite = 'unreachable';
  }

  // Check internal core reachability (non-blocking)
  const coreUrl = process.env.INTERNAL_CORE_BASE_URL;
  if (!coreUrl) {
    checks.core = 'not_configured';
  } else {
    try {
      const { coreFetch } = await import('@/lib/core-client');
      await coreFetch('/internal/health', { timeoutMs: 20_000 });
      checks.core = 'reachable';
    } catch {
      checks.core = 'unreachable';
    }
  }

  // Check service auth config
  const serviceToken = process.env.INTERNAL_SERVICE_TOKEN;
  const jwtKeySet = process.env.INTERNAL_JWT_SIGNING_KEYS;
  const jwtKey = process.env.INTERNAL_JWT_SIGNING_KEY;
  checks.service_auth = serviceToken || jwtKey || jwtKeySet
    ? 'configured'
    : 'not_configured';

  return NextResponse.json(checks);
}
