/**
 * GET /api/progress/summary — Reading progress summary.
 * DECISION_197: MongoDB → SQLite migration.
 */
import type { NextRequest } from 'next/server';

import { requireSession } from '@/lib/api/auth-guards';
import { apiError } from '@/lib/api/response';
import { readingProgress } from '@/lib/db/repositories';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { session, userId } = await requireSession(request);
  if (!session || !userId) {
    return apiError('unauthorized', 'Not authenticated', 401);
  }

  try {
    const docs = readingProgress.findByUser(userId, 10);

    const mapped = docs.map((doc) => ({
      _id: doc.id,
      sectionSlug: doc.section_slug,
      percent: doc.percent,
      lastAnchorId: doc.last_anchor_id ?? null,
      updatedAt: doc.updated_at,
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
