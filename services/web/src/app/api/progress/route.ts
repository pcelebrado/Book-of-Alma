/**
 * POST /api/progress — Record reading progress.
 * DECISION_197: MongoDB → SQLite migration.
 */
import type { NextRequest } from 'next/server';

import { requireSession } from '@/lib/api/auth-guards';
import { apiError, parseJsonBody } from '@/lib/api/response';
import { readingProgress } from '@/lib/db/repositories';

export const dynamic = 'force-dynamic';

interface ProgressBody {
  sectionSlug?: string;
  percent?: number;
  lastAnchorId?: string;
}

export async function POST(request: NextRequest) {
  const { session, userId } = await requireSession(request);
  if (!session || !userId) {
    return apiError('unauthorized', 'Not authenticated', 401);
  }

  const body = await parseJsonBody<ProgressBody>(request);
  if (!body?.sectionSlug || typeof body.percent !== 'number') {
    return apiError('invalid_request', 'sectionSlug and percent are required', 400);
  }

  try {
    const result = readingProgress.upsert({
      userId,
      sectionSlug: body.sectionSlug,
      percent: Math.max(0, Math.min(100, body.percent)),
      lastAnchorId: body.lastAnchorId,
    });

    return Response.json({
      progress: {
        _id: result.id,
        userId: result.user_id,
        sectionSlug: result.section_slug,
        percent: result.percent,
        lastAnchorId: result.last_anchor_id,
        updatedAt: result.updated_at,
      },
    });
  } catch (error) {
    console.error('[api/progress][POST] database_error', error);
    return apiError('database_error', 'Unable to store progress', 503);
  }
}
