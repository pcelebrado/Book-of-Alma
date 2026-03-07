/**
 * GET /api/progress/summary — Reading progress summary.
 * DECISION_197: MongoDB → SQLite migration.
 */
import type { NextRequest } from 'next/server';

import { requireSession } from '@/lib/api/auth-guards';
import { apiError } from '@/lib/api/response';
import { coreFetch } from '@/lib/core-client';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { session, userId } = await requireSession(request);
  if (!session || !userId) {
    return apiError('unauthorized', 'Not authenticated', 401);
  }

  try {
    const result = await coreFetch<{
      continue: {
        id: string;
        section_slug: string;
        percent: number;
        last_anchor_id: string | null;
        updated_at: string;
      } | null;
      recent: Array<{
        id: string;
        section_slug: string;
        percent: number;
        last_anchor_id: string | null;
        updated_at: string;
      }>;
    }>('/internal/web/progress/summary', {
      uid: userId,
      role: session.role,
    });

    const mapped = result.recent.map((doc) => ({
      _id: doc.id,
      sectionSlug: doc.section_slug,
      percent: doc.percent,
      lastAnchorId: doc.last_anchor_id ?? null,
      updatedAt: doc.updated_at,
    }));

    return Response.json({
      continue: result.continue
        ? {
            _id: result.continue.id,
            sectionSlug: result.continue.section_slug,
            percent: result.continue.percent,
            lastAnchorId: result.continue.last_anchor_id ?? null,
            updatedAt: result.continue.updated_at,
          }
        : null,
      recent: mapped,
    });
  } catch (error) {
    console.error('[api/progress/summary][GET] database_error', error);
    return apiError('database_error', 'Unable to load progress summary', 503);
  }
}
