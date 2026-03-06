/**
 * GET /api/book/section?slug=... — Return a book section by slug.
 * DECISION_197: MongoDB → SQLite migration.
 */
import type { NextRequest } from 'next/server';

import { requireSession } from '@/lib/api/auth-guards';
import { apiError } from '@/lib/api/response';
import { bookSections } from '@/lib/db/repositories';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { session, userId } = await requireSession(request);
  if (!session || !userId) {
    return apiError('unauthorized', 'Not authenticated', 401);
  }

  const slug = request.nextUrl.searchParams.get('slug');
  if (!slug) {
    return apiError('invalid_request', 'slug is required', 400);
  }

  try {
    const section = bookSections.findBySlug(slug);

    if (!section) {
      return apiError('not_found', 'Section not found', 404);
    }

    return Response.json({
      section: {
        slug: section.slug,
        title: section.section_title,
        part: { index: section.part_index, slug: section.part_slug, title: section.part_title },
        chapter: { index: section.chapter_index, slug: section.chapter_slug, title: section.chapter_title },
        order: {
          sectionIndex: section.section_index,
        },
      },
      frontmatter: section.frontmatter ? JSON.parse(section.frontmatter) : {
        summary: [],
        checklist: [],
        mistakes: [],
        drill: {},
      },
      body: {
        format: 'markdown',
        content: section.body_markdown,
      },
      headings: section.headings ? JSON.parse(section.headings) : [],
    });
  } catch (error) {
    console.error('[api/book/section] database_error', error);
    return apiError('database_error', 'Unable to load section data', 503);
  }
}
