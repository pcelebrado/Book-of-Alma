/**
 * POST /api/bookmarks/toggle — Toggle a bookmark.
 * DECISION_197: MongoDB → SQLite migration.
 */
import type { NextRequest } from 'next/server';

import { requireSession } from '@/lib/api/auth-guards';
import { apiError, parseJsonBody } from '@/lib/api/response';
import { CoreClientError, coreFetch } from '@/lib/core-client';

export const dynamic = 'force-dynamic';

interface ToggleBookmarkBody {
  sectionSlug?: string;
  anchorId?: string;
}

export async function POST(request: NextRequest) {
  const { session, userId } = await requireSession(request);
  if (!session || !userId) {
    return apiError('unauthorized', 'Not authenticated', 401);
  }

  const body = await parseJsonBody<ToggleBookmarkBody>(request);
  if (!body?.sectionSlug) {
    return apiError('invalid_request', 'sectionSlug is required', 400);
  }

  try {
    const result = await coreFetch<{ bookmarked: boolean }, ToggleBookmarkBody>(
      '/internal/web/bookmarks/toggle',
      {
        method: 'POST',
        uid: userId,
        role: session.role,
        body,
      },
    );

    return Response.json({ bookmarked: result.bookmarked });
  } catch (error) {
    if (error instanceof CoreClientError && error.statusCode === 400) {
      return apiError('invalid_request', 'sectionSlug is required', 400);
    }
    return apiError('database_error', 'Unable to toggle bookmark', 503);
  }
}
