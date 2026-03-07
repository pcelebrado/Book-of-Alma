/**
 * POST /api/progress — Record reading progress.
 * DECISION_197: MongoDB → SQLite migration.
 */
import type { NextRequest } from 'next/server';

import { requireSession } from '@/lib/api/auth-guards';
import { apiError, parseJsonBody } from '@/lib/api/response';
import { CoreClientError, coreFetch } from '@/lib/core-client';

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
    const result = await coreFetch<{ progress: {
      id: string;
      user_id: string;
      section_slug: string;
      percent: number;
      last_anchor_id: string | null;
      updated_at: string;
    } }, ProgressBody>('/internal/web/progress', {
      method: 'POST',
      uid: userId,
      role: session.role,
      body,
    });

    const progress = result.progress;

    return Response.json({
      progress: {
        _id: progress.id,
        userId: progress.user_id,
        sectionSlug: progress.section_slug,
        percent: progress.percent,
        lastAnchorId: progress.last_anchor_id,
        updatedAt: progress.updated_at,
      },
    });
  } catch (error) {
    if (error instanceof CoreClientError && error.statusCode === 400) {
      return apiError('invalid_request', 'sectionSlug and percent are required', 400);
    }
    return apiError('database_error', 'Unable to store progress', 503);
  }
}
