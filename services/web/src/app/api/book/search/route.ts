import type { NextRequest } from 'next/server';

import { requireSession } from '@/lib/api/auth-guards';
import { apiError } from '@/lib/api/response';
import { apiRateLimited } from '@/lib/api/response';
import { getBookSectionsCollection } from '@/lib/db/collections';
import { logSecurityEvent } from '@/lib/logger';
import { RATE_LIMIT_RULES, enforceRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { session } = await requireSession(request);
  if (!session) {
    return apiError('unauthorized', 'Not authenticated', 401);
  }

  const searchLimit = await enforceRateLimit(RATE_LIMIT_RULES.search, session.id);
  if (!searchLimit.allowed) {
    await logSecurityEvent('auth.rate_limited', {
      requestId: request.headers.get('x-request-id'),
      route: '/api/book/search',
      userId: session.id,
      details: {
        key: `search:user:${session.id}`,
        retryAfterSeconds: searchLimit.retryAfterSeconds,
      },
    });

    return apiRateLimited(RATE_LIMIT_RULES.search.message, searchLimit.retryAfterSeconds);
  }

  const q = request.nextUrl.searchParams.get('q')?.trim();
  if (!q) {
    return apiError('invalid_request', 'q is required', 400);
  }

  const sections = await getBookSectionsCollection();

  let results: Array<{
    sectionSlug: string;
    anchorId: string;
    score: number;
    snippet: string;
  }> = [];

  try {
    const docs = await sections
      .find(
        { $text: { $search: q } },
        {
          projection: {
            slug: 1,
            bodyMarkdown: 1,
            headings: 1,
            score: { $meta: 'textScore' },
          },
          sort: { score: { $meta: 'textScore' } },
          limit: 20,
        },
      )
      .toArray();

    results = docs.map((doc) => {
      const snippet = (doc.bodyMarkdown ?? '').slice(0, 240);
      const firstHeading = doc.headings?.[0]?.id ?? '';
      return {
        sectionSlug: doc.slug,
        anchorId: firstHeading,
        score: Number((doc as { score?: number }).score ?? 0),
        snippet,
      };
    });
  } catch {
    const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const docs = await sections
      .find(
        {
          $or: [
            { slug: { $regex: safe, $options: 'i' } },
            { bodyMarkdown: { $regex: safe, $options: 'i' } },
          ],
        },
        {
          projection: { slug: 1, bodyMarkdown: 1, headings: 1 },
          limit: 20,
        },
      )
      .toArray();

    results = docs.map((doc) => ({
      sectionSlug: doc.slug,
      anchorId: doc.headings?.[0]?.id ?? '',
      score: 0,
      snippet: (doc.bodyMarkdown ?? '').slice(0, 240),
    }));
  }

  return Response.json({ q, results });
}
