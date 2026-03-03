import { ObjectId } from 'mongodb';
import type { NextRequest } from 'next/server';

import { requireSession } from '@/lib/api/auth-guards';
import { apiError, parseJsonBody } from '@/lib/api/response';
import { getNotesCollection } from '@/lib/db/collections';

export const dynamic = 'force-dynamic';

interface CreateNoteBody {
  sectionSlug?: string;
  anchorId?: string;
  selection?: { text: string; startOffset: number; endOffset: number };
  noteText?: string;
  tags?: string[];
  title?: string;
}

export async function POST(request: NextRequest) {
  const { session, userObjectId } = await requireSession(request);
  if (!session || !userObjectId) {
    return apiError('unauthorized', 'Not authenticated', 401);
  }

  const body = await parseJsonBody<CreateNoteBody>(request);
  if (!body?.sectionSlug || !body.noteText) {
    return apiError('invalid_request', 'sectionSlug and noteText are required', 400);
  }

  const now = new Date();
  const notes = await getNotesCollection();
  const note = {
    userId: userObjectId,
    sectionSlug: body.sectionSlug,
    anchorId: body.anchorId,
    selection: body.selection,
    title: body.title,
    body: body.noteText,
    tags: body.tags ?? [],
    createdAt: now,
    updatedAt: now,
  };

  const result = await notes.insertOne(note);

  return Response.json({
    note: {
      ...note,
      _id: result.insertedId.toHexString(),
      userId: userObjectId.toHexString(),
    },
  });
}

export async function GET(request: NextRequest) {
  const { session, userObjectId } = await requireSession(request);
  if (!session || !userObjectId) {
    return apiError('unauthorized', 'Not authenticated', 401);
  }

  const sectionSlug = request.nextUrl.searchParams.get('sectionSlug');
  const notes = await getNotesCollection();

  const filter: Record<string, unknown> = { userId: userObjectId };
  if (sectionSlug) {
    filter.sectionSlug = sectionSlug;
  }

  const docs = await notes.find(filter).sort({ updatedAt: -1 }).toArray();

  return Response.json({
    notes: docs.map((doc) => ({
      ...doc,
      _id: doc._id.toHexString(),
      userId: doc.userId.toHexString(),
    })),
  });
}
