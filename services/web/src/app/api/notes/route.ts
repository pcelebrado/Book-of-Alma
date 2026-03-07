/**
 * POST /api/notes — Create a note.
 * GET  /api/notes — List notes for current user.
 * DECISION_197: MongoDB → SQLite migration.
 */
import type { NextRequest } from 'next/server';

import { requireSession } from '@/lib/api/auth-guards';
import { apiError, parseJsonBody } from '@/lib/api/response';
import { CoreClientError, coreFetch } from '@/lib/core-client';

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
    const created = await coreFetch<{ note: {
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
    } }, {
      sectionSlug: string;
      anchorId?: string;
      selection?: { text: string; startOffset: number; endOffset: number };
      noteText: string;
      title?: string;
      tags?: string[];
    }>('/internal/web/notes', {
      method: 'POST',
      uid: userId,
      role: session.role,
      body: {
        sectionSlug: body.sectionSlug,
        anchorId: body.anchorId,
        selection: body.selection,
        title: body.title,
        noteText: body.noteText,
        tags: body.tags,
      },
    });

    const note = created.note;

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
    if (error instanceof CoreClientError && error.statusCode === 400) {
      return apiError('invalid_request', 'sectionSlug and noteText are required', 400);
    }
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
    const path = sectionSlug
      ? `/internal/web/notes?sectionSlug=${encodeURIComponent(sectionSlug)}`
      : '/internal/web/notes';
    const result = await coreFetch<{ notes: Array<{
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
    }> }>(path, {
      uid: userId,
      role: session.role,
    });
    const docs = result.notes;

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
