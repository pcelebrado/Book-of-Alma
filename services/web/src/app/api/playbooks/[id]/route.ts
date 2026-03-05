import { ObjectId } from 'mongodb';
import type { NextRequest } from 'next/server';

import { isAdmin, requireSession } from '@/lib/api/auth-guards';
import { apiError, parseJsonBody } from '@/lib/api/response';
import { getPlaybooksCollection } from '@/lib/db/collections';

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
  const { session, userObjectId } = await requireSession(request);
  if (!session || !userObjectId) {
    return apiError('unauthorized', 'Not authenticated', 401);
  }

  if (!ObjectId.isValid(context.params.id)) {
    return apiError('invalid_request', 'Invalid playbook id', 400);
  }

  const playbookId = new ObjectId(context.params.id);
  const body = await parseJsonBody<UpdatePlaybookBody>(request);
  if (!body) {
    return apiError('invalid_request', 'Invalid JSON body', 400);
  }

  try {
    const playbooks = await getPlaybooksCollection();
    const existing = await playbooks.findOne({ _id: playbookId });
    if (!existing) {
      return apiError('not_found', 'Playbook not found', 404);
    }

    const ownerMatch = existing.createdBy.toHexString() === userObjectId.toHexString();
    if (!ownerMatch && !isAdmin(session)) {
      return apiError('forbidden', 'Not allowed to edit this playbook', 403);
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof body.title === 'string') {
      updates.title = body.title;
    }
    if (Array.isArray(body.triggers)) {
      updates.triggers = body.triggers;
    }
    if (Array.isArray(body.checklist)) {
      updates.checklist = body.checklist;
    }
    if (typeof body.scenarioTree === 'string') {
      updates.scenarioTree = body.scenarioTree;
    }
    if (Array.isArray(body.linkedSections)) {
      updates.linkedSections = body.linkedSections;
    }
    if (Array.isArray(body.tags)) {
      updates.tags = body.tags;
    }

    const updated = await playbooks.findOneAndUpdate(
      { _id: playbookId },
      { $set: updates },
      { returnDocument: 'after' },
    );

    if (!updated) {
      return apiError('not_found', 'Playbook not found', 404);
    }

    return Response.json({
      playbook: {
        ...updated,
        _id: updated._id.toHexString(),
        createdBy: updated.createdBy.toHexString(),
      },
    });
  } catch (error) {
    console.error('[api/playbooks/:id][PATCH] database_error', error);
    return apiError('database_error', 'Unable to update playbook', 503);
  }
}
