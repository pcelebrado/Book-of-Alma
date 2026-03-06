/**
 * GET /api/book/toc — Return book table of contents.
 * DECISION_197: MongoDB → SQLite migration.
 */
import { bookToc } from '@/lib/db/repositories';
import { requireSession } from '@/lib/api/auth-guards';
import { apiError } from '@/lib/api/response';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { session, userId } = await requireSession(request);

  if (!session || !userId) {
    return apiError('unauthorized', 'Authentication required to access book contents', 401);
  }

  try {
    const toc = bookToc.findDefault();

    return Response.json({
      tocTree: toc ? JSON.parse(toc.tree) : {},
      updatedAt: toc?.updated_at ?? null,
    });
  } catch (error) {
    console.error('[api/book/toc][GET] database_error', error);
    return apiError('database_error', 'Unable to load table of contents', 503);
  }
}
