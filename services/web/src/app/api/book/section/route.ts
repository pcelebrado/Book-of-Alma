import type { NextRequest } from 'next/server';

import { requireSession } from '@/lib/api/auth-guards';
import { apiError } from '@/lib/api/response';
import { getBookSectionsCollection } from '@/lib/db/collections';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { session, userObjectId } = await requireSession(request);
  if (!session || !userObjectId) {
    return apiError('unauthorized', 'Not authenticated', 401);
  }

  const slug = request.nextUrl.searchParams.get('slug');
  if (!slug) {
    return apiError('invalid_request', 'slug is required', 400);
  }

  try {
    const sections = await getBookSectionsCollection();

    const section =
      (await sections.findOne({ slug, status: 'published' })) ??
      (await sections.findOne({ slug }));

    if (!section) {
      return apiError('not_found', 'Section not found', 404);
    }

    return Response.json({
      section: {
        slug: section.slug,
        title: section.section.title,
        part: section.part,
        chapter: section.chapter,
        order: {
          sectionIndex: section.section.index,
        },
      },
      frontmatter: section.frontmatter ?? {
        summary: [],
        checklist: [],
        mistakes: [],
        drill: {},
      },
      body: {
        format: 'markdown',
        content: section.bodyMarkdown,
      },
      headings: section.headings ?? [],
    });
  } catch (error) {
    console.error('[api/book/section] database_error', error);
    return apiError('database_error', 'Unable to load section data', 503);
  }
}
