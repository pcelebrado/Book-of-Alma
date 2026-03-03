import type { NextRequest } from 'next/server';

import { apiError } from '@/lib/api/response';
import { getSessionUser } from '@/lib/auth/auth-config';
import { getUsersCollection } from '@/lib/db/collections';
import { ObjectId } from 'mongodb';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return apiError('unauthorized', 'Not authenticated', 401);
  }

  if (!ObjectId.isValid(session.id)) {
    return apiError('invalid_session', 'Session is invalid', 401);
  }

  const users = await getUsersCollection();
  const user = await users.findOne({ _id: new ObjectId(session.id) });
  if (!user) {
    return apiError('unauthorized', 'User not found', 401);
  }

  return Response.json({
    user: {
      id: user._id.toHexString(),
      name: user.name,
      email: user.email,
    },
    role: user.role,
    prefs: user.prefs ?? null,
  });
}
