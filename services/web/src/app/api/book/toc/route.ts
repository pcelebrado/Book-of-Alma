import { getBookTocCollection } from '@/lib/db/collections';
import { requireSession } from '@/lib/api/auth-guards';
import { apiError } from '@/lib/api/response';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/book/toc
 * 
 * Returns the book table of contents.
 * 
 * AUTHENTICATION REQUIRED: This endpoint is protected and requires
 * a valid user session. The TOC structure is considered part of the
 * book content and should not be exposed to unauthenticated users.
 * 
 * If you need a public preview of the book structure, consider:
 * 1. Creating a separate /api/book/preview endpoint with limited data
 * 2. Adding a "publicPreview" flag to specific sections
 * 3. Using a different collection for public-facing metadata
 */
export async function GET(request: NextRequest) {
  // Require authentication - TOC is part of book content
  const { session, userObjectId } = await requireSession(request);
  
  if (!session || !userObjectId) {
    return apiError('unauthorized', 'Authentication required to access book contents', 401);
  }

  try {
    const tocCollection = await getBookTocCollection();

    const toc =
      (await tocCollection.findOne({ _id: 'default' })) ??
      (await tocCollection.find({}).sort({ updatedAt: -1 }).limit(1).next());

    return Response.json({
      tocTree: toc?.tree ?? {},
      updatedAt: toc?.updatedAt ?? null,
    });
  } catch (error) {
    console.error('[api/book/toc][GET] database_error', error);
    return apiError('database_error', 'Unable to load table of contents', 503);
  }
}
