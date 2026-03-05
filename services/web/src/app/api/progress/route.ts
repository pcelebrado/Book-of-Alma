import type { NextRequest } from 'next/server';

import { requireSession } from '@/lib/api/auth-guards';
import { apiError, parseJsonBody } from '@/lib/api/response';
import { getReadingProgressCollection } from '@/lib/db/collections';

export const dynamic = 'force-dynamic';

interface ProgressBody {
  sectionSlug?: string;
  percent?: number;
  lastAnchorId?: string;
}

export async function POST(request: NextRequest) {
  const { session, userObjectId } = await requireSession(request);
  if (!session || !userObjectId) {
    return apiError('unauthorized', 'Not authenticated', 401);
  }

  const body = await parseJsonBody<ProgressBody>(request);
  if (!body?.sectionSlug || typeof body.percent !== 'number') {
    return apiError('invalid_request', 'sectionSlug and percent are required', 400);
  }

  try {
    const progress = await getReadingProgressCollection();
    const now = new Date();
    const result = await progress.findOneAndUpdate(
      { userId: userObjectId, sectionSlug: body.sectionSlug },
      {
        $set: {
          userId: userObjectId,
          sectionSlug: body.sectionSlug,
          percent: Math.max(0, Math.min(100, body.percent)),
          lastAnchorId: body.lastAnchorId,
          updatedAt: now,
        },
      },
      { upsert: true, returnDocument: 'after' },
    );

    if (!result) {
      return apiError('internal_error', 'Unable to store progress', 500);
    }

    return Response.json({
      progress: {
        ...result,
        _id: result._id.toHexString(),
        userId: result.userId.toHexString(),
      },
    });
  } catch (error) {
    console.error('[api/progress][POST] database_error', error);
    return apiError('database_error', 'Unable to store progress', 503);
  }
}
