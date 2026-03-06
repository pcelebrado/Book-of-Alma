/**
 * POST /api/highlights — Create a highlight.
 * DECISION_197: MongoDB → SQLite migration.
 */
import type { NextRequest } from 'next/server';

import { requireSession } from '@/lib/api/auth-guards';
import { apiError, parseJsonBody } from '@/lib/api/response';
import { highlights } from '@/lib/db/repositories';

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
  const { session, userId } = await requireSession(request);
  if (!session || !userId) {
    return apiError('unauthorized', 'Not authenticated', 401);
  }

  const body = await parseJsonBody<CreateHighlightBody>(request);
  if (!body?.sectionSlug || !body.text || !body.range) {
    return apiError('invalid_request', 'sectionSlug, text, and range are required', 400);
  }

  try {
    const highlight = highlights.insert({
      userId,
      sectionSlug: body.sectionSlug,
      anchorId: body.anchorId,
      range: body.range,
      text: body.text,
      color: body.color,
      noteId: body.noteId,
    });

    return Response.json({
      highlight: {
        _id: highlight.id,
        userId: highlight.user_id,
        sectionSlug: highlight.section_slug,
        anchorId: highlight.anchor_id,
        range: { startOffset: highlight.range_start, endOffset: highlight.range_end },
        text: highlight.text,
        color: highlight.color,
        noteId: highlight.note_id,
        createdAt: highlight.created_at,
      },
    });
  } catch (error) {
    console.error('[api/highlights][POST] database_error', error);
    return apiError('database_error', 'Unable to create highlight', 503);
  }
}
