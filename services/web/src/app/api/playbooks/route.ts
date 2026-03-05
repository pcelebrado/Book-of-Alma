import type { NextRequest } from 'next/server';
import type { Filter } from 'mongodb';

import { requireSession } from '@/lib/api/auth-guards';
import { apiError } from '@/lib/api/response';
import { getPlaybooksCollection, type PlaybookDocument } from '@/lib/db/collections';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { session, userObjectId } = await requireSession(request);
  if (!session || !userObjectId) {
    return apiError('unauthorized', 'Not authenticated', 401);
  }

  try {
    const playbooks = await getPlaybooksCollection();
    const filter: Filter<PlaybookDocument> =
      session.role === 'admin'
        ? {}
        : {
            $or: [
              { status: 'published' as const },
              { status: 'draft' as const, createdBy: userObjectId },
            ],
          };

    const docs = await playbooks.find(filter).sort({ updatedAt: -1 }).toArray();

    return Response.json({
      playbooks: docs.map((doc) => ({
        ...doc,
        _id: doc._id.toHexString(),
        createdBy: doc.createdBy.toHexString(),
      })),
    });
  } catch (error) {
    console.error('[api/playbooks][GET] database_error', error);
    return apiError('database_error', 'Unable to load playbooks', 503);
  }
}
