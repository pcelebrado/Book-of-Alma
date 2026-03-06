/**
 * PATCH /api/notes/:id — Update a note.
 * DELETE /api/notes/:id — Delete a note.
 * DECISION_197: MongoDB → SQLite migration.
 */
import type { NextRequest } from 'next/server';

import { requireSession } from '@/lib/api/auth-guards';
import { apiError, parseJsonBody } from '@/lib/api/response';
import { notes } from '@/lib/db/repositories';

export const dynamic = 'force-dynamic';

interface UpdateNoteBody {
  noteText?: string;
  tags?: string[];
  title?: string;
}

export async function PATCH(
  request: NextRequest,
  context: { params: { id: string } },
) {
  const { session, userId } = await requireSession(request);
  if (!session || !userId) {
    return apiError('unauthorized', 'Not authenticated', 401);
  }

  const noteId = context.params.id;
  if (!noteId) {
    return apiError('invalid_request', 'Invalid note id', 400);
  }

  const body = await parseJsonBody<UpdateNoteBody>(request);
  if (!body) {
    return apiError('invalid_request', 'Invalid JSON body', 400);
  }

  const updates: Record<string, unknown> = {};
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
    const result = notes.update(noteId, userId, updates);

    if (!result) {
      return apiError('not_found', 'Note not found', 404);
    }

    return Response.json({
      note: {
        _id: result.id,
        userId: result.user_id,
        sectionSlug: result.section_slug,
        anchorId: result.anchor_id,
        selection: result.selection ? JSON.parse(result.selection) : null,
        title: result.title,
        body: result.body,
        tags: JSON.parse(result.tags),
        createdAt: result.created_at,
        updatedAt: result.updated_at,
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
  const { session, userId } = await requireSession(request);
  if (!session || !userId) {
    return apiError('unauthorized', 'Not authenticated', 401);
  }

  const noteId = context.params.id;
  if (!noteId) {
    return apiError('invalid_request', 'Invalid note id', 400);
  }

  try {
    const deleted = notes.delete(noteId, userId);

    if (!deleted) {
      return apiError('not_found', 'Note not found', 404);
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error('[api/notes/:id][DELETE] database_error', error);
    return apiError('database_error', 'Unable to delete note', 503);
  }
}
