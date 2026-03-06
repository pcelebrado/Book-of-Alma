/**
 * POST /api/notes — Create a note.
 * GET  /api/notes — List notes for current user.
 * DECISION_197: MongoDB → SQLite migration.
 */
import type { NextRequest } from 'next/server';

import { requireSession } from '@/lib/api/auth-guards';
import { apiError, parseJsonBody } from '@/lib/api/response';
import { notes } from '@/lib/db/repositories';

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
  const { session, userId } = await requireSession(request);
  if (!session || !userId) {
    return apiError('unauthorized', 'Not authenticated', 401);
  }

  const body = await parseJsonBody<CreateNoteBody>(request);
  if (!body?.sectionSlug || !body.noteText) {
    return apiError('invalid_request', 'sectionSlug and noteText are required', 400);
  }

  try {
    const note = notes.insert({
      userId,
      sectionSlug: body.sectionSlug,
      anchorId: body.anchorId,
      selection: body.selection,
      title: body.title,
      body: body.noteText,
      tags: body.tags,
    });

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
    console.error('[api/notes][POST] database_error', error);
    return apiError('database_error', 'Unable to create note', 503);
  }
}

export async function GET(request: NextRequest) {
  const { session, userId } = await requireSession(request);
  if (!session || !userId) {
    return apiError('unauthorized', 'Not authenticated', 401);
  }

  try {
    const sectionSlug = request.nextUrl.searchParams.get('sectionSlug') ?? undefined;
    const docs = notes.findByUser(userId, sectionSlug);

    return Response.json({
      notes: docs.map((doc) => ({
        _id: doc.id,
        userId: doc.user_id,
        sectionSlug: doc.section_slug,
        anchorId: doc.anchor_id,
        selection: doc.selection ? JSON.parse(doc.selection) : null,
        title: doc.title,
        body: doc.body,
        tags: JSON.parse(doc.tags),
        createdAt: doc.created_at,
        updatedAt: doc.updated_at,
      })),
    });
  } catch (error) {
    console.error('[api/notes][GET] database_error', error);
    return apiError('database_error', 'Unable to load notes', 503);
  }
}
