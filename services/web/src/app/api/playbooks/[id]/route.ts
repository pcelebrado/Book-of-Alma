/**
 * PATCH /api/playbooks/:id — Update a playbook.
 * DECISION_197: MongoDB → SQLite migration.
 */
import type { NextRequest } from 'next/server';

import { isAdmin, requireSession } from '@/lib/api/auth-guards';
import { apiError, parseJsonBody } from '@/lib/api/response';
import { playbooks } from '@/lib/db/repositories';

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
    const existing = playbooks.findById(playbookId);
    if (!existing) {
      return apiError('not_found', 'Playbook not found', 404);
    }

    const ownerMatch = existing.created_by === userId;
    if (!ownerMatch && !isAdmin(session)) {
      return apiError('forbidden', 'Not allowed to edit this playbook', 403);
    }

    const updates: Record<string, unknown> = {};
    if (typeof body.title === 'string') updates.title = body.title;
    if (Array.isArray(body.triggers)) updates.triggers = body.triggers;
    if (Array.isArray(body.checklist)) updates.checklist = body.checklist;
    if (typeof body.scenarioTree === 'string') updates.scenarioTree = body.scenarioTree;
    if (Array.isArray(body.linkedSections)) updates.linkedSections = body.linkedSections;
    if (Array.isArray(body.tags)) updates.tags = body.tags;

    const updated = playbooks.update(playbookId, updates);

    if (!updated) {
      return apiError('not_found', 'Playbook not found', 404);
    }

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
    console.error('[api/playbooks/:id][PATCH] database_error', error);
    return apiError('database_error', 'Unable to update playbook', 503);
  }
}
