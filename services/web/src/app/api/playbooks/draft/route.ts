/**
 * POST /api/playbooks/draft — Create a draft playbook.
 * DECISION_197: MongoDB → SQLite migration.
 */
import type { NextRequest } from 'next/server';

import { requireSession } from '@/lib/api/auth-guards';
import { apiError, parseJsonBody } from '@/lib/api/response';
import { CoreClientError, coreFetch } from '@/lib/core-client';

export const dynamic = 'force-dynamic';

interface DraftBody {
  title?: string;
  triggers?: string[];
  checklist?: string[];
  scenarioTree?: string;
  linkedSections?: string[];
  tags?: string[];
}

export async function POST(request: NextRequest) {
  const { session, userId } = await requireSession(request);
  if (!session || !userId) {
    return apiError('unauthorized', 'Not authenticated', 401);
  }

  const body = await parseJsonBody<DraftBody>(request);
  if (!body?.title) {
    return apiError('invalid_request', 'title is required', 400);
  }

  try {
    const result = await coreFetch<{ playbook: {
      id: string;
      status: string;
      title: string;
      triggers: string;
      checklist: string;
      scenario_tree: string;
      linked_sections: string;
      tags: string;
      created_by: string;
      created_at: string;
      updated_at: string;
      published_at: string | null;
    } }, DraftBody>('/internal/web/playbooks/draft', {
      method: 'POST',
      uid: userId,
      role: session.role,
      body,
    });
    const playbook = result.playbook;

    return Response.json({
      playbook: {
        _id: playbook.id,
        status: playbook.status,
        title: playbook.title,
        triggers: JSON.parse(playbook.triggers),
        checklist: JSON.parse(playbook.checklist),
        scenarioTree: playbook.scenario_tree,
        linkedSections: JSON.parse(playbook.linked_sections),
        tags: JSON.parse(playbook.tags),
        createdBy: playbook.created_by,
        createdAt: playbook.created_at,
        updatedAt: playbook.updated_at,
      },
    });
  } catch (error) {
    if (error instanceof CoreClientError && error.statusCode === 400) {
      return apiError('invalid_request', 'title is required', 400);
    }
    return apiError('database_error', 'Unable to create draft playbook', 503);
  }
}
