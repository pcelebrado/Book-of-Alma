/**
 * GET /api/admin/status — Admin system status overview.
 * DECISION_197: MongoDB → SQLite migration.
 */
import type { NextRequest } from 'next/server';

import { isAdmin, requireSession } from '@/lib/api/auth-guards';
import { apiError } from '@/lib/api/response';
import { coreFetch, CoreClientError } from '@/lib/core-client';
import { auditLog } from '@/lib/db/repositories';
import { isDbHealthy } from '@/lib/db/sqlite';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { session } = await requireSession(request);
  if (!session) {
    return apiError('unauthorized', 'Not authenticated', 401);
  }

  if (!isAdmin(session)) {
    return apiError('forbidden', 'Admin role required', 403);
  }

  const sqlite: 'connected' | 'unreachable' = isDbHealthy() ? 'connected' : 'unreachable';

  let core: 'ok' | 'unreachable' = 'ok';
  let coreComponents: Record<string, unknown> = {};
  let lastCoreUnavailableAt: Date | null = null;

  try {
    const health = await coreFetch<{ components?: Record<string, unknown> }>(
      '/internal/health',
      {
        method: 'GET',
        uid: session.id,
        role: session.role,
        rid: request.headers.get('x-request-id') ?? undefined,
        timeoutMs: 12_000,
      },
    );
    coreComponents = health.components ?? {};
  } catch (error) {
    core = 'unreachable';
    if (error instanceof CoreClientError) {
      lastCoreUnavailableAt = new Date();
    }
  }

  let lastReindex: { created_at?: string; details?: string } | null = null;
  try {
    const row = auditLog.findLastByAction('reindex');
    if (row) {
      lastReindex = { created_at: row.created_at, details: row.details };
    }
  } catch {
    lastReindex = null;
  }

  return Response.json({
    sqlite,
    core,
    components: coreComponents,
    lastReindexRun: {
      at: lastReindex?.created_at ?? null,
      details: lastReindex?.details ? JSON.parse(lastReindex.details) : null,
    },
    lastCoreHealthCheck: new Date().toISOString(),
    lastCoreUnavailableAt,
    lastDbErrorAt: sqlite === 'unreachable' ? new Date().toISOString() : null,
  });
}
