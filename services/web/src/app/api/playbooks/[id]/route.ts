/**
 * PATCH /api/playbooks/:id — Update a playbook.
 * DECISION_197: MongoDB → SQLite migration.
 */
import type { NextRequest } from 'next/server';

import { isAdmin, requireSession } from '@/lib/api/auth-guards';
import { apiError, parseJsonBody } from '@/lib/api/response';
import { CoreClientError, coreFetch } from '@/lib/core-client';

export const dynamic = 'force-dynamic';

interface UpdatePlaybookBody {
  title?: string;
  triggers?: string[];
  checklist?: string[];
  scenarioTree?: string;
  linkedSections?: string[];
  tags?: string[];
}

export async function PATCH(
  request: NextRequest,
  context: { params: { id: string } },
) {
  const { session, userId } = await requireSession(request);
  if (!session || !userId) {
    return apiError('unauthorized', 'Not authenticated', 401);
  }

  const playbookId = context.params.id;
  if (!playbookId) {
    return apiError('invalid_request', 'Invalid playbook id', 400);
  }

  const body = await parseJsonBody<UpdatePlaybookBody>(request);
  if (!body) {
    return apiError('invalid_request', 'Invalid JSON body', 400);
  }

  try {
    const updatedResult = await coreFetch<{ playbook: {
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
    } }, UpdatePlaybookBody>(`/internal/web/playbooks/${encodeURIComponent(playbookId)}`, {
      method: 'PATCH',
      uid: userId,
      role: isAdmin(session) ? 'admin' : 'user',
      body,
    });
    const updated = updatedResult.playbook;

    return Response.json({
      playbook: {
        _id: updated.id,
        status: updated.status,
        title: updated.title,
        triggers: JSON.parse(updated.triggers),
        checklist: JSON.parse(updated.checklist),
        scenarioTree: updated.scenario_tree,
        linkedSections: JSON.parse(updated.linked_sections),
        tags: JSON.parse(updated.tags),
        createdBy: updated.created_by,
        createdAt: updated.created_at,
        updatedAt: updated.updated_at,
        publishedAt: updated.published_at,
      },
    });
  } catch (error) {
    if (error instanceof CoreClientError && error.statusCode === 404) {
      return apiError('not_found', 'Playbook not found', 404);
    }
    if (error instanceof CoreClientError && error.statusCode === 403) {
      return apiError('forbidden', 'Not allowed to edit this playbook', 403);
    }
    if (error instanceof CoreClientError && error.statusCode === 400) {
      return apiError('invalid_request', 'Invalid playbook id', 400);
    }
    return apiError('database_error', 'Unable to update playbook', 503);
  }
}
