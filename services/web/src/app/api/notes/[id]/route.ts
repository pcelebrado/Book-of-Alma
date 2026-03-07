/**
 * PATCH /api/notes/:id — Update a note.
 * DELETE /api/notes/:id — Delete a note.
 * DECISION_197: MongoDB → SQLite migration.
 */
import type { NextRequest } from 'next/server';

import { requireSession } from '@/lib/api/auth-guards';
import { apiError, parseJsonBody } from '@/lib/api/response';
import { CoreClientError, coreFetch } from '@/lib/core-client';

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
    const result = await coreFetch<{ note: {
      id: string;
      user_id: string;
      section_slug: string;
      anchor_id: string | null;
      selection: string | null;
      title: string | null;
      body: string;
      tags: string;
      created_at: string;
      updated_at: string;
    } }, UpdateNoteBody>(`/internal/web/notes/${encodeURIComponent(noteId)}`, {
      method: 'PATCH',
      uid: userId,
      role: session.role,
      body,
    });

    const note = result.note;

    return Response.json({
      note: {
        _id: note.id,
        userId: note.user_id,
        sectionSlug: note.section_slug,
        anchorId: note.anchor_id,
        selection: note.selection ? JSON.parse(note.selection) : null,
        title: note.title,
        body: note.body,
        tags: JSON.parse(note.tags),
        createdAt: note.created_at,
        updatedAt: note.updated_at,
      },
    });
  } catch (error) {
    if (error instanceof CoreClientError && error.statusCode === 404) {
      return apiError('not_found', 'Note not found', 404);
    }
    if (error instanceof CoreClientError && error.statusCode === 400) {
      return apiError('invalid_request', 'Invalid note id', 400);
    }
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
    await coreFetch<{ ok: boolean }>(`/internal/web/notes/${encodeURIComponent(noteId)}`, {
      method: 'DELETE',
      uid: userId,
      role: session.role,
    });

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof CoreClientError && error.statusCode === 404) {
      return apiError('not_found', 'Note not found', 404);
    }
    if (error instanceof CoreClientError && error.statusCode === 400) {
      return apiError('invalid_request', 'Invalid note id', 400);
    }
    return apiError('database_error', 'Unable to delete note', 503);
  }
}
