/**
 * GET /api/book/search?q=... — Full-text search across book sections.
 * DECISION_197: MongoDB → SQLite migration. Uses FTS5 with LIKE fallback.
 */
import type { NextRequest } from 'next/server';

import { requireSession } from '@/lib/api/auth-guards';
import { apiError } from '@/lib/api/response';
import { apiRateLimited } from '@/lib/api/response';
import { CoreClientError, coreFetch } from '@/lib/core-client';
import { logSecurityEvent } from '@/lib/logger';
import { RATE_LIMIT_RULES, enforceRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { session } = await requireSession(request);
  if (!session) {
    return apiError('unauthorized', 'Not authenticated', 401);
  }

  const searchLimit = await enforceRateLimit(RATE_LIMIT_RULES.search, session.id);
  if (!searchLimit.allowed) {
    await logSecurityEvent('auth.rate_limited', {
      requestId: request.headers.get('x-request-id'),
      route: '/api/book/search',
      userId: session.id,
      details: {
        key: `search:user:${session.id}`,
        retryAfterSeconds: searchLimit.retryAfterSeconds,
      },
    });

    return apiRateLimited(RATE_LIMIT_RULES.search.message, searchLimit.retryAfterSeconds);
  }

  const q = request.nextUrl.searchParams.get('q')?.trim();
  if (!q) {
    return apiError('invalid_request', 'q is required', 400);
  }

  try {
    const result = await coreFetch<{ q: string; results: Array<{
      sectionSlug: string;
      anchorId: string;
      score: number;
      snippet: string;
    }> }>(`/internal/web/book/search?q=${encodeURIComponent(q)}`, {
      uid: session.id,
      role: session.role,
      rid: request.headers.get('x-request-id') ?? undefined,
    });

    return Response.json({ q: result.q, results: result.results });
  } catch (error) {
    if (error instanceof CoreClientError && error.statusCode === 400) {
      return apiError('invalid_request', 'q is required', 400);
    }
    return apiError('database_error', 'Unable to search sections', 503);
  }
}
