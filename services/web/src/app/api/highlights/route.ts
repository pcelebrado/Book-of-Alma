/**
 * POST /api/highlights — Create a highlight.
 * DECISION_197: MongoDB → SQLite migration.
 */
import type { NextRequest } from 'next/server';

import { requireSession } from '@/lib/api/auth-guards';
import { apiError, parseJsonBody } from '@/lib/api/response';
import { CoreClientError, coreFetch } from '@/lib/core-client';

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
    const result = await coreFetch<{ highlight: {
      id: string;
      user_id: string;
      section_slug: string;
      anchor_id: string | null;
      range_start: number;
      range_end: number;
      text: string;
      color: string;
      note_id: string | null;
      created_at: string;
    } }, CreateHighlightBody>('/internal/web/highlights', {
      method: 'POST',
      uid: userId,
      role: session.role,
      body,
    });
    const highlight = result.highlight;

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
    if (error instanceof CoreClientError && error.statusCode === 400) {
      return apiError('invalid_request', 'sectionSlug, text, and range are required', 400);
    }
    return apiError('database_error', 'Unable to create highlight', 503);
  }
}
