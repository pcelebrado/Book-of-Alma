import { ObjectId } from 'mongodb';
import type { NextRequest } from 'next/server';

import { isAdmin, requireSession } from '@/lib/api/auth-guards';
import { apiError, apiRateLimited } from '@/lib/api/response';
import { getPlaybooksCollection } from '@/lib/db/collections';
import { logSecurityEvent, writeAuditLog } from '@/lib/logger';
import { RATE_LIMIT_RULES, enforceRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  context: { params: { id: string } },
) {
  const { session } = await requireSession(request);
  if (!session) {
    return apiError('unauthorized', 'Not authenticated', 401);
  }

  if (!isAdmin(session)) {
    return apiError('forbidden', 'Admin role required', 403);
  }

  const adminLimit = await enforceRateLimit(RATE_LIMIT_RULES.admin, session.id);
  if (!adminLimit.allowed) {
    await logSecurityEvent('auth.rate_limited', {
      requestId: request.headers.get('x-request-id'),
      route: '/api/playbooks/[id]/publish',
      userId: session.id,
      details: {
        key: `admin:user:${session.id}`,
        retryAfterSeconds: adminLimit.retryAfterSeconds,
      },
    });

    return apiRateLimited(RATE_LIMIT_RULES.admin.message, adminLimit.retryAfterSeconds);
  }

  if (!ObjectId.isValid(context.params.id)) {
    return apiError('invalid_request', 'Invalid playbook id', 400);
  }

  const playbookId = new ObjectId(context.params.id);
  const now = new Date();
  const playbooks = await getPlaybooksCollection();
  const updated = await playbooks.findOneAndUpdate(
    { _id: playbookId },
    {
      $set: {
        status: 'published',
        updatedAt: now,
        publishedAt: now,
      },
    },
    { returnDocument: 'after' },
  );

  if (!updated) {
    return apiError('not_found', 'Playbook not found', 404);
  }

  await writeAuditLog({
    actorUserId: session.id,
    action: 'book_publish',
    details: {
      requestId: request.headers.get('x-request-id'),
      playbookId: context.params.id,
      status: 'published',
    },
  });

  await logSecurityEvent('admin.action', {
    requestId: request.headers.get('x-request-id'),
    route: '/api/playbooks/[id]/publish',
    userId: session.id,
    details: {
      action: 'publish',
      playbookId: context.params.id,
    },
  });

  return Response.json({
    playbook: {
      ...updated,
      _id: updated._id.toHexString(),
      createdBy: updated.createdBy.toHexString(),
    },
  });
}
