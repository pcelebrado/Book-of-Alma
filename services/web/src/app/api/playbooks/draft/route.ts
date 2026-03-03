import type { NextRequest } from 'next/server';

import { requireSession } from '@/lib/api/auth-guards';
import { apiError, parseJsonBody } from '@/lib/api/response';
import { getPlaybooksCollection } from '@/lib/db/collections';

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
  const { session, userObjectId } = await requireSession(request);
  if (!session || !userObjectId) {
    return apiError('unauthorized', 'Not authenticated', 401);
  }

  const body = await parseJsonBody<DraftBody>(request);
  if (!body?.title) {
    return apiError('invalid_request', 'title is required', 400);
  }

  const now = new Date();
  const playbook = {
    status: 'draft' as const,
    title: body.title,
    triggers: body.triggers ?? [],
    checklist: body.checklist ?? [],
    scenarioTree: body.scenarioTree ?? '',
    linkedSections: body.linkedSections ?? [],
    tags: body.tags ?? [],
    createdBy: userObjectId,
    createdAt: now,
    updatedAt: now,
  };

  const playbooks = await getPlaybooksCollection();
  const result = await playbooks.insertOne(playbook);

  return Response.json({
    playbook: {
      ...playbook,
      _id: result.insertedId.toHexString(),
      createdBy: userObjectId.toHexString(),
    },
  });
}
