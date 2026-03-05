import type { NextRequest } from 'next/server';

import { requireSession } from '@/lib/api/auth-guards';
import { apiError, parseJsonBody } from '@/lib/api/response';
import { getBookmarksCollection } from '@/lib/db/collections';

export const dynamic = 'force-dynamic';

interface ToggleBookmarkBody {
  sectionSlug?: string;
  anchorId?: string;
}

export async function POST(request: NextRequest) {
  const { session, userObjectId } = await requireSession(request);
  if (!session || !userObjectId) {
    return apiError('unauthorized', 'Not authenticated', 401);
  }

  const body = await parseJsonBody<ToggleBookmarkBody>(request);
  if (!body?.sectionSlug) {
    return apiError('invalid_request', 'sectionSlug is required', 400);
  }

  try {
    const bookmarks = await getBookmarksCollection();
    const filter = {
      userId: userObjectId,
      sectionSlug: body.sectionSlug,
      anchorId: body.anchorId,
    };

    const existing = await bookmarks.findOne(filter);
    if (existing) {
      await bookmarks.deleteOne({ _id: existing._id });
      return Response.json({ bookmarked: false });
    }

    await bookmarks.insertOne({
      ...filter,
      createdAt: new Date(),
    });

    return Response.json({ bookmarked: true });
  } catch (error) {
    console.error('[api/bookmarks/toggle][POST] database_error', error);
    return apiError('database_error', 'Unable to toggle bookmark', 503);
  }
}
