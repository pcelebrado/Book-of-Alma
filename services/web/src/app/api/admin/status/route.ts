import type { NextRequest } from 'next/server';

import { isAdmin, requireSession } from '@/lib/api/auth-guards';
import { apiError } from '@/lib/api/response';
import { coreFetch, CoreClientError } from '@/lib/core-client';
import { getAuditLogCollection } from '@/lib/db/collections';
import { getMongoClient } from '@/lib/db/mongo';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { session } = await requireSession(request);
  if (!session) {
    return apiError('unauthorized', 'Not authenticated', 401);
  }

  if (!isAdmin(session)) {
    return apiError('forbidden', 'Admin role required', 403);
  }

  let mongo: 'connected' | 'unreachable' = 'connected';
  try {
    const client = getMongoClient();
    await client.db().command({ ping: 1 });
  } catch {
    mongo = 'unreachable';
  }

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
      },
    );
    coreComponents = health.components ?? {};
  } catch (error) {
    core = 'unreachable';
    if (error instanceof CoreClientError) {
      lastCoreUnavailableAt = new Date();
    }
  }

  const auditLog = await getAuditLogCollection();
  const lastReindex = await auditLog.findOne(
    { action: 'reindex' },
    { sort: { createdAt: -1 } },
  );

  return Response.json({
    mongo,
    core,
    components: coreComponents,
    lastReindexRun: {
      at: lastReindex?.createdAt ?? null,
      details: lastReindex?.details ?? null,
    },
    lastCoreHealthCheck: new Date().toISOString(),
    lastCoreUnavailableAt,
    lastMongoErrorAt: mongo === 'unreachable' ? new Date().toISOString() : null,
  });
}
