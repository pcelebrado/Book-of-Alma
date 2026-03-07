/**
 * GET /api/book/toc — Return book table of contents.
 * DECISION_197: MongoDB → SQLite migration.
 */
import { requireSession } from '@/lib/api/auth-guards';
import { apiError } from '@/lib/api/response';
import type { NextRequest } from 'next/server';
import { CoreClientError, coreFetch } from '@/lib/core-client';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { session, userId } = await requireSession(request);

  if (!session || !userId) {
    return apiError('unauthorized', 'Authentication required to access book contents', 401);
  }

  try {
    const result = await coreFetch<{ tocTree?: Record<string, unknown>; updatedAt?: string | null }>(
      '/internal/web/book/toc',
      {
        uid: userId,
        role: session.role,
      },
    );

    return Response.json({
      tocTree: result.tocTree ?? {},
      updatedAt: result.updatedAt ?? null,
    });
  } catch (error) {
    if (error instanceof CoreClientError && error.statusCode === 401) {
      return apiError('unauthorized', 'Authentication required to access book contents', 401);
    }
    return apiError('database_error', 'Unable to load table of contents', 503);
  }
}
