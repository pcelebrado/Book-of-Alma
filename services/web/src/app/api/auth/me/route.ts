/**
 * GET /api/auth/me — Return current authenticated user.
 * DECISION_197: MongoDB → SQLite migration.
 */
import type { NextRequest } from 'next/server';

import { apiError } from '@/lib/api/response';
import { getSessionUser } from '@/lib/auth/auth-config';
import { users } from '@/lib/db/repositories';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return apiError('unauthorized', 'Not authenticated', 401);
  }

  if (!session.id) {
    return apiError('invalid_session', 'Session is invalid', 401);
  }

  const user = users.findById(session.id);
  if (!user) {
    return apiError('unauthorized', 'User not found', 401);
  }

  return Response.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
    },
    role: user.role,
    prefs: user.prefs ? JSON.parse(user.prefs) : null,
  });
}
