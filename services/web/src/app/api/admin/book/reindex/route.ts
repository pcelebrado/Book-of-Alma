import type { NextRequest } from 'next/server';

import { isAdmin, requireSession } from '@/lib/api/auth-guards';
import { apiError, apiRateLimited, parseJsonBody } from '@/lib/api/response';
import { coreFetch, CoreClientError } from '@/lib/core-client';
import { logSecurityEvent, writeAuditLog } from '@/lib/logger';
import { RATE_LIMIT_RULES, enforceRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

interface ReindexBody {
  version?: number;
  dryRun?: boolean;
}

export async function POST(request: NextRequest) {
  const { session } = await requireSession(request);
  if (!session) {
    return apiError('unauthorized', 'Not authenticated', 401);
  }

  if (!isAdmin(session)) {
    return apiError('forbidden', 'Admin role required', 403);
  }

  const adminLimit = await enforceRateLimit(RATE_LIMIT_RULES.admin, session.id);
  if (!adminLimit.allowed) {
    await logSecurityEvent('auth.rate_limited', {
      requestId: request.headers.get('x-request-id'),
      route: '/api/admin/book/reindex',
      userId: session.id,
      details: {
        key: `admin:user:${session.id}`,
        retryAfterSeconds: adminLimit.retryAfterSeconds,
      },
    });

    return apiRateLimited(RATE_LIMIT_RULES.admin.message, adminLimit.retryAfterSeconds);
  }

  const body = (await parseJsonBody<ReindexBody>(request)) ?? {};

  try {
    const result = await coreFetch<{ started: boolean; jobId?: string }>(
      '/internal/index/rebuild',
      {
        method: 'POST',
        body: {
          scope: 'book',
          version: body.version,
          dryRun: body.dryRun,
        },
        uid: session.id,
        role: session.role,
        rid: request.headers.get('x-request-id') ?? undefined,
      },
    );

    await writeAuditLog({
      actorUserId: session.id,
      action: 'reindex',
      details: {
        requestId: request.headers.get('x-request-id'),
        started: result.started,
        jobId: result.jobId ?? null,
      },
    });

    await logSecurityEvent('admin.action', {
      requestId: request.headers.get('x-request-id'),
      route: '/api/admin/book/reindex',
      userId: session.id,
      details: {
        action: 'reindex',
        started: result.started,
      },
    });

    return Response.json(result);
  } catch (error) {
    if (error instanceof CoreClientError) {
      return apiError('core_unavailable', error.message, error.statusCode, {
        requestId: error.requestId,
      });
    }

    return apiError('internal_error', 'Unable to trigger reindex', 500);
  }
}
