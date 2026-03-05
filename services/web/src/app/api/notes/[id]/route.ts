import { ObjectId } from 'mongodb';
import type { NextRequest } from 'next/server';

import { requireSession } from '@/lib/api/auth-guards';
import { apiError, parseJsonBody } from '@/lib/api/response';
import { getNotesCollection } from '@/lib/db/collections';

export const dynamic = 'force-dynamic';

interface UpdateNoteBody {
  noteText?: string;
  tags?: string[];
  title?: string;
}

function parseNoteId(id: string) {
  if (!ObjectId.isValid(id)) {
    return null;
  }

  return new ObjectId(id);
}

export async function PATCH(
  request: NextRequest,
  context: { params: { id: string } },
) {
  const { session, userObjectId } = await requireSession(request);
  if (!session || !userObjectId) {
    return apiError('unauthorized', 'Not authenticated', 401);
  }

  const noteId = parseNoteId(context.params.id);
  if (!noteId) {
    return apiError('invalid_request', 'Invalid note id', 400);
  }

  const body = await parseJsonBody<UpdateNoteBody>(request);
  if (!body) {
    return apiError('invalid_request', 'Invalid JSON body', 400);
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof body.noteText === 'string') {
    updates.body = body.noteText;
  }
  if (Array.isArray(body.tags)) {
    updates.tags = body.tags;
  }
  if (typeof body.title === 'string') {
    updates.title = body.title;
  }

  try {
    const notes = await getNotesCollection();

    const result = await notes.findOneAndUpdate(
      { _id: noteId, userId: userObjectId },
      { $set: updates },
      { returnDocument: 'after' },
    );

    if (!result) {
      return apiError('not_found', 'Note not found', 404);
    }

    return Response.json({
      note: {
        ...result,
        _id: result._id.toHexString(),
        userId: result.userId.toHexString(),
      },
    });
  } catch (error) {
    console.error('[api/notes/:id][PATCH] database_error', error);
    return apiError('database_error', 'Unable to update note', 503);
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: { id: string } },
) {
  const { session, userObjectId } = await requireSession(request);
  if (!session || !userObjectId) {
    return apiError('unauthorized', 'Not authenticated', 401);
  }

  const noteId = parseNoteId(context.params.id);
  if (!noteId) {
    return apiError('invalid_request', 'Invalid note id', 400);
  }

  try {
    const notes = await getNotesCollection();
    const result = await notes.deleteOne({ _id: noteId, userId: userObjectId });

    if (result.deletedCount === 0) {
      return apiError('not_found', 'Note not found', 404);
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error('[api/notes/:id][DELETE] database_error', error);
    return apiError('database_error', 'Unable to delete note', 503);
  }
}
