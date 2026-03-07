/**
 * GET /api/auth/me — Return current authenticated user.
 * DECISION_197: MongoDB → SQLite migration.
 */
import type { NextRequest } from 'next/server';

import { apiError } from '@/lib/api/response';
import { getSessionUser } from '@/lib/auth/auth-config';
import { CoreClientError, coreFetch } from '@/lib/core-client';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return apiError('unauthorized', 'Not authenticated', 401);
  }

  if (!session.id) {
    return apiError('invalid_session', 'Session is invalid', 401);
  }

  let user: {
    id: string;
    name: string;
    email: string;
    role: 'admin' | 'user';
    prefs: unknown;
  };

  try {
    const result = await coreFetch<{ user: {
      id: string;
      name: string;
      email: string;
      role: 'admin' | 'user';
      prefs: unknown;
    } }>('/internal/web/auth/me', {
      uid: session.id,
      role: session.role,
    });
    user = result.user;
  } catch (error) {
    if (error instanceof CoreClientError && error.statusCode === 401) {
      return apiError('unauthorized', 'User not found', 401);
    }
    return apiError('core_auth_unavailable', 'Unable to load user profile', 503);
  }

  return Response.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
    },
    role: user.role,
    prefs: user.prefs ?? null,
  });
}
