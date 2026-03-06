/**
 * Auth guard utilities for API routes.
 * DECISION_197: MongoDB → SQLite migration.
 * Replaced ObjectId with plain string IDs.
 */
import type { NextRequest } from 'next/server';

import { getSessionUser } from '@/lib/auth/auth-config';
import type { SessionUser } from '@/lib/auth/session';

export async function requireSession(
  _request: NextRequest,
): Promise<{ session: SessionUser | null; userId: string | null }> {
  const session = await getSessionUser();
  if (!session || !session.id) {
    return {
      session: null,
      userId: null,
    };
  }

  return {
    session,
    userId: session.id,
  };
}

export function isAdmin(session: SessionUser | null): boolean {
  return session?.role === 'admin';
}
