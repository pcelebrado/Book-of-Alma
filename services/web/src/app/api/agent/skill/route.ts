import type { NextRequest } from 'next/server';

import { requireSession } from '@/lib/api/auth-guards';
import { apiError, apiRateLimited, parseJsonBody } from '@/lib/api/response';
import { coreFetch, CoreClientError } from '@/lib/core-client';
import { logSecurityEvent, writeAuditLog } from '@/lib/logger';
import { RATE_LIMIT_RULES, enforceRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

interface AgentSkillBody {
  skill?:
    | 'explain'
    | 'socratic'
    | 'flashcards'
    | 'checklist'
    | 'scenario_tree'
    | 'notes_assist';
  context?: {
    sectionSlug?: string;
    anchorId?: string;
    selectedText?: string;
    userNoteIds?: string[];
    mode?: 'simple' | 'technical' | 'analogy';
  };
}

export async function POST(request: NextRequest) {
  const { session } = await requireSession(request);
  if (!session) {
    return apiError('unauthorized', 'Not authenticated', 401);
  }

  const minuteLimit = await enforceRateLimit(RATE_LIMIT_RULES.agentMinute, session.id);
  if (!minuteLimit.allowed) {
    await logSecurityEvent('agent.skill.rate_limited', {
      requestId: request.headers.get('x-request-id'),
      route: '/api/agent/skill',
      userId: session.id,
      details: {
        retryAfterSeconds: minuteLimit.retryAfterSeconds,
        window: 'minute',
      },
    });

    return apiRateLimited(
      RATE_LIMIT_RULES.agentMinute.message,
      minuteLimit.retryAfterSeconds,
    );
  }

  const hourLimit = await enforceRateLimit(RATE_LIMIT_RULES.agentHour, session.id);
  if (!hourLimit.allowed) {
    await logSecurityEvent('agent.skill.rate_limited', {
      requestId: request.headers.get('x-request-id'),
      route: '/api/agent/skill',
      userId: session.id,
      details: {
        retryAfterSeconds: hourLimit.retryAfterSeconds,
        window: 'hour',
      },
    });

    return apiRateLimited(
      RATE_LIMIT_RULES.agentHour.message,
      hourLimit.retryAfterSeconds,
    );
  }

  const body = await parseJsonBody<AgentSkillBody>(request);
  if (!body?.skill || !body.context) {
    return apiError('invalid_request', 'skill and context are required', 400);
  }

  const requestId = request.headers.get('x-request-id') ?? undefined;

  try {
    await logSecurityEvent('agent.skill.invoked', {
      requestId,
      route: '/api/agent/skill',
      userId: session.id,
      details: {
        skill: body.skill,
      },
    });

    const result = await coreFetch('/internal/agent/run', {
      method: 'POST',
      body: {
        skill: body.skill,
        context: body.context,
      },
      uid: session.id,
      role: session.role,
      rid: requestId,
    });

    await writeAuditLog({
      actorUserId: session.id,
      action: 'agent_run',
      details: {
        requestId,
        skill: body.skill,
      },
    });

    return Response.json(result);
  } catch (error) {
    if (error instanceof CoreClientError) {
      return apiError('core_unavailable', error.message, error.statusCode, {
        requestId: error.requestId,
      });
    }

    return apiError('internal_error', 'Agent skill request failed', 500);
  }
}
