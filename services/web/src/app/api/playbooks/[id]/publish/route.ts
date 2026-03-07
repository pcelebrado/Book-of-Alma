/**
 * POST /api/playbooks/:id/publish — Publish a playbook (admin only).
 * DECISION_197: MongoDB → SQLite migration.
 */
import type { NextRequest } from 'next/server';

import { isAdmin, requireSession } from '@/lib/api/auth-guards';
import { apiError, apiRateLimited } from '@/lib/api/response';
import { CoreClientError, coreFetch } from '@/lib/core-client';
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

  const playbookId = context.params.id;
  if (!playbookId) {
    return apiError('invalid_request', 'Invalid playbook id', 400);
  }

  let updated: {
    id: string;
    status: string;
    title: string;
    triggers: string;
    checklist: string;
    scenario_tree: string;
    linked_sections: string;
    tags: string;
    created_by: string;
    created_at: string;
    updated_at: string;
    published_at: string | null;
  };
  try {
    const result = await coreFetch<{ playbook: typeof updated }>(
      `/internal/web/playbooks/${encodeURIComponent(playbookId)}/publish`,
      {
        method: 'POST',
        uid: session.id,
        role: 'admin',
      },
    );
    updated = result.playbook;
  } catch (error) {
    if (error instanceof CoreClientError && error.statusCode === 404) {
      return apiError('not_found', 'Playbook not found', 404);
    }
    if (error instanceof CoreClientError && error.statusCode === 403) {
      return apiError('forbidden', 'Admin role required', 403);
    }
    if (error instanceof CoreClientError && error.statusCode === 400) {
      return apiError('invalid_request', 'Invalid playbook id', 400);
    }
    return apiError('database_error', 'Unable to publish playbook', 503);
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
      _id: updated.id,
      status: updated.status,
      title: updated.title,
      triggers: JSON.parse(updated.triggers),
      checklist: JSON.parse(updated.checklist),
      scenarioTree: updated.scenario_tree,
      linkedSections: JSON.parse(updated.linked_sections),
      tags: JSON.parse(updated.tags),
      createdBy: updated.created_by,
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
      publishedAt: updated.published_at,
    },
  });
}
