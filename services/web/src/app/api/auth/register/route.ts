/**
 * POST /api/auth/register — Create initial admin account.
 * GET  /api/auth/register — Check onboarding state.
 * DECISION_197 follow-up: onboarding is core-backed.
 */

import type { NextRequest } from 'next/server';

import { apiError, apiRateLimited, parseJsonBody } from '@/lib/api/response';
import { CoreClientError, coreFetch } from '@/lib/core-client';
import { logSecurityEvent } from '@/lib/logger';
import { RATE_LIMIT_RULES, enforceRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

interface RegisterBody {
  name?: string;
  email?: string;
  password?: string;
}

function resolveIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() ?? 'unknown';
  }

  return request.headers.get('x-real-ip') ?? 'unknown';
}

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export async function GET() {
  try {
    const state = await coreFetch<{ onboardingOpen: boolean; userCount: number }>(
      '/internal/web/auth/onboarding-state',
    );
    return Response.json({
      onboardingOpen: state.onboardingOpen,
      userCount: state.userCount,
    });
  } catch {
    return apiError('onboarding_state_unavailable', 'Unable to verify onboarding state', 503);
  }
}

export async function POST(request: NextRequest) {
  const body = await parseJsonBody<RegisterBody>(request);
  const name = String(body?.name ?? '').trim();
  const email = normalizeEmail(String(body?.email ?? ''));
  const password = String(body?.password ?? '');
  const requestId = request.headers.get('x-request-id');
  const ip = resolveIp(request);

  if (!name || !email || !password) {
    return apiError('invalid_request', 'name, email, and password are required', 400);
  }

  if (password.length < 8) {
    return apiError('invalid_password', 'Password must be at least 8 characters', 400);
  }

  const registerLimit = await enforceRateLimit(RATE_LIMIT_RULES.login, ip);
  if (!registerLimit.allowed) {
    await logSecurityEvent('auth.rate_limited', {
      requestId,
      route: '/api/auth/register',
      ip,
      details: {
        retryAfterSeconds: registerLimit.retryAfterSeconds,
        key: `register:ip:${ip}`,
      },
    });
    return apiRateLimited(RATE_LIMIT_RULES.login.message, registerLimit.retryAfterSeconds);
  }

  try {
    const state = await coreFetch<{ onboardingOpen: boolean; userCount: number }>(
      '/internal/web/auth/onboarding-state',
      {
        rid: requestId ?? undefined,
      },
    );

    if (!state.onboardingOpen) {
      return apiError('onboarding_closed', 'Initial admin has already been created', 403);
    }
  } catch {
    return apiError('onboarding_state_unavailable', 'Unable to verify onboarding state', 503);
  }

  let insertedId = '';
  try {
    const created = await coreFetch<{
      ok: boolean;
      role: string;
      user: { id: string; name: string; email: string };
    }, {
      name: string;
      email: string;
      password: string;
    }>('/internal/web/auth/register', {
      method: 'POST',
      body: {
        name,
        email,
        password,
      },
      rid: requestId ?? undefined,
    });
    insertedId = created.user.id;
  } catch (error) {
    if (error instanceof CoreClientError && error.statusCode === 403) {
      return apiError('onboarding_closed', 'Initial admin has already been created', 403);
    }

    if (error instanceof CoreClientError && error.statusCode === 409) {
      return apiError('email_taken', 'An account with that email already exists', 409);
    }

    return apiError('onboarding_state_unavailable', 'Unable to create initial admin', 503);
  }

  await logSecurityEvent('auth.login.success', {
    requestId,
    route: '/api/auth/register',
    userId: insertedId,
    ip,
    details: {
      role: 'admin',
      source: 'onboarding_register',
    },
  });

  return Response.json({
    ok: true,
    user: {
      id: insertedId,
      name,
      email,
    },
    role: 'admin',
  });
}
