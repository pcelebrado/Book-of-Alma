/**
 * GET /api/playbooks — List playbooks for current user.
 * DECISION_197: MongoDB → SQLite migration.
 */
import type { NextRequest } from 'next/server';

import { requireSession } from '@/lib/api/auth-guards';
import { apiError } from '@/lib/api/response';
import { playbooks } from '@/lib/db/repositories';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { session, userId } = await requireSession(request);
  if (!session || !userId) {
    return apiError('unauthorized', 'Not authenticated', 401);
  }

  try {
    const docs = playbooks.findAll(userId, session.role);

    return Response.json({
      playbooks: docs.map((doc) => ({
        _id: doc.id,
        status: doc.status,
        title: doc.title,
        triggers: JSON.parse(doc.triggers),
        checklist: JSON.parse(doc.checklist),
        scenarioTree: doc.scenario_tree,
        linkedSections: JSON.parse(doc.linked_sections),
        tags: JSON.parse(doc.tags),
        createdBy: doc.created_by,
        createdAt: doc.created_at,
        updatedAt: doc.updated_at,
        publishedAt: doc.published_at,
      })),
    });
  } catch (error) {
    console.error('[api/playbooks][GET] database_error', error);
    return apiError('database_error', 'Unable to load playbooks', 503);
  }
}
