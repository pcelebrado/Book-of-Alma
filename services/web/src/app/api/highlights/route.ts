import { ObjectId } from 'mongodb';
import type { NextRequest } from 'next/server';

import { requireSession } from '@/lib/api/auth-guards';
import { apiError, parseJsonBody } from '@/lib/api/response';
import { getHighlightsCollection } from '@/lib/db/collections';

export const dynamic = 'force-dynamic';

interface CreateHighlightBody {
  sectionSlug?: string;
  anchorId?: string;
  range?: { startOffset: number; endOffset: number };
  text?: string;
  color?: string;
  noteId?: string;
}

export async function POST(request: NextRequest) {
  const { session, userObjectId } = await requireSession(request);
  if (!session || !userObjectId) {
    return apiError('unauthorized', 'Not authenticated', 401);
  }

  const body = await parseJsonBody<CreateHighlightBody>(request);
  if (!body?.sectionSlug || !body.text || !body.range) {
    return apiError('invalid_request', 'sectionSlug, text, and range are required', 400);
  }

  const noteId = body.noteId && ObjectId.isValid(body.noteId)
    ? new ObjectId(body.noteId)
    : undefined;

  const highlight = {
    userId: userObjectId,
    sectionSlug: body.sectionSlug,
    anchorId: body.anchorId,
    range: body.range,
    text: body.text,
    color: body.color ?? 'yellow',
    noteId,
    createdAt: new Date(),
  };

  const highlights = await getHighlightsCollection();
  const result = await highlights.insertOne(highlight);

  return Response.json({
    highlight: {
      ...highlight,
      _id: result.insertedId.toHexString(),
      userId: userObjectId.toHexString(),
      noteId: noteId?.toHexString(),
    },
  });
}
