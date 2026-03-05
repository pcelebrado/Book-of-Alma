import type { NextRequest } from 'next/server';

import { isAdmin, requireSession } from '@/lib/api/auth-guards';
import { apiError } from '@/lib/api/response';
import { coreFetch, CoreClientError } from '@/lib/core-client';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { session } = await requireSession(request);
  if (!session) return apiError('unauthorized', 'Not authenticated', 401);
  if (!isAdmin(session)) return apiError('forbidden', 'Admin role required', 403);

  try {
    const payload = await coreFetch('/internal/openclaw/setup/auth-groups', {
      method: 'GET',
      uid: session.id,
      role: session.role,
      rid: request.headers.get('x-request-id') ?? undefined,
    });
    return Response.json(payload);
  } catch (error) {
    if (error instanceof CoreClientError) {
      return apiError('core_unavailable', error.message, error.statusCode, {
        requestId: error.requestId,
      });
    }
    return apiError('internal_error', 'Unable to load auth groups', 500);
  }
}
