import type { NextRequest } from 'next/server';

import { requireSession } from '@/lib/api/auth-guards';
import { apiError } from '@/lib/api/response';
import { getReadingProgressCollection } from '@/lib/db/collections';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { session, userObjectId } = await requireSession(request);
  if (!session || !userObjectId) {
    return apiError('unauthorized', 'Not authenticated', 401);
  }

  try {
    const progress = await getReadingProgressCollection();
    const docs = await progress
      .find({ userId: userObjectId })
      .sort({ updatedAt: -1 })
      .limit(10)
      .toArray();

    const mapped = docs.map((doc) => ({
      _id: doc._id.toHexString(),
      sectionSlug: doc.sectionSlug,
      percent: doc.percent,
      lastAnchorId: doc.lastAnchorId ?? null,
      updatedAt: doc.updatedAt,
    }));

    return Response.json({
      continue: mapped[0] ?? null,
      recent: mapped,
    });
  } catch (error) {
    console.error('[api/progress/summary][GET] database_error', error);
    return apiError('database_error', 'Unable to load progress summary', 503);
  }
}
