/**
 * POST /api/bookmarks/toggle — Toggle a bookmark.
 * DECISION_197: MongoDB → SQLite migration.
 */
import type { NextRequest } from 'next/server';

import { requireSession } from '@/lib/api/auth-guards';
import { apiError, parseJsonBody } from '@/lib/api/response';
import { bookmarks } from '@/lib/db/repositories';

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
    const existing = bookmarks.findOne(userId, body.sectionSlug, body.anchorId);
    if (existing) {
      bookmarks.delete(existing.id);
      return Response.json({ bookmarked: false });
    }

    bookmarks.insert({
      userId,
      sectionSlug: body.sectionSlug,
      anchorId: body.anchorId,
    });

    return Response.json({ bookmarked: true });
  } catch (error) {
    console.error('[api/bookmarks/toggle][POST] database_error', error);
    return apiError('database_error', 'Unable to toggle bookmark', 503);
  }
}
