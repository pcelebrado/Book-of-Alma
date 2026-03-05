import type { NextRequest } from 'next/server';

import { isAdmin, requireSession } from '@/lib/api/auth-guards';
import { apiError, parseJsonBody } from '@/lib/api/response';
import { coreFetch, CoreClientError } from '@/lib/core-client';

export const dynamic = 'force-dynamic';

interface PairingApproveBody {
  channel?: string;
  code?: string;
}

export async function POST(request: NextRequest) {
  const { session } = await requireSession(request);
  if (!session) return apiError('unauthorized', 'Not authenticated', 401);
  if (!isAdmin(session)) return apiError('forbidden', 'Admin role required', 403);

  const body = (await parseJsonBody<PairingApproveBody>(request)) ?? {};

  try {
    const payload = await coreFetch('/internal/openclaw/setup/pairing/approve', {
      method: 'POST',
      body,
      uid: session.id,
      role: session.role,
      rid: request.headers.get('x-request-id') ?? undefined,
      timeoutMs: 15_000,
    });
    return Response.json(payload);
  } catch (error) {
    if (error instanceof CoreClientError) {
      return apiError('core_unavailable', error.message, error.statusCode, {
        requestId: error.requestId,
        details: error.details,
      });
    }
    return apiError('internal_error', 'Unable to approve pairing', 500);
  }
}
