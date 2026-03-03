import { ObjectId } from 'mongodb';
import type { NextRequest } from 'next/server';

import { getSessionUser } from '@/lib/auth/auth-config';
import type { SessionUser } from '@/lib/auth/session';

export async function requireSession(
  _request: NextRequest,
): Promise<{ session: SessionUser | null; userObjectId: ObjectId | null }> {
  const session = await getSessionUser();
  if (!session || !ObjectId.isValid(session.id)) {
    return {
      session: null,
      userObjectId: null,
    };
  }

  return {
    session,
    userObjectId: new ObjectId(session.id),
  };
}

export function isAdmin(session: SessionUser | null): boolean {
  return session?.role === 'admin';
}
