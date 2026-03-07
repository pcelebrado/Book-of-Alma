/**
 * POST /api/auth/login — Authenticate user.
 * DECISION_197 follow-up: login verification is core-backed.
 */
import { AuthError } from 'next-auth';
import type { NextRequest } from 'next/server';

import { apiError, apiRateLimited, parseJsonBody } from '@/lib/api/response';
import { signIn } from '@/lib/auth/auth-config';
import { CoreClientError, coreFetch } from '@/lib/core-client';
import { logSecurityEvent } from '@/lib/logger';
import { RATE_LIMIT_RULES, enforceRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

interface LoginBody {
  email?: string;
  username?: string;
  password?: string;
  code?: string;
}

interface CoreAuthUser {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
}

function resolveIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() ?? 'unknown';
  }

  return request.headers.get('x-real-ip') ?? 'unknown';
}

export async function POST(request: NextRequest) {
  const body = await parseJsonBody<LoginBody>(request);
  const email = String(body?.email ?? body?.username ?? '').trim().toLowerCase();
  const password = String(body?.password ?? body?.code ?? '');
  const requestId = request.headers.get('x-request-id');
  const ip = resolveIp(request);

  if (!email || !password) {
    return apiError('invalid_request', 'email and password are required', 400);
  }

  const loginLimit = await enforceRateLimit(RATE_LIMIT_RULES.login, ip);
  if (!loginLimit.allowed) {
    await logSecurityEvent('auth.rate_limited', {
      requestId,
      route: '/api/auth/login',
      ip,
      details: {
        retryAfterSeconds: loginLimit.retryAfterSeconds,
        key: `login:ip:${ip}`,
      },
    });
    return apiRateLimited(RATE_LIMIT_RULES.login.message, loginLimit.retryAfterSeconds);
  }

  let verifiedUser: CoreAuthUser | null = null;

  try {
    await signIn('credentials', {
      email,
      password,
      redirect: false,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      await logSecurityEvent('auth.login.fail', {
        requestId,
        route: '/api/auth/login',
        ip,
        details: {
          reason: error.type,
          email,
        },
      });
      return apiError('invalid_credentials', 'Invalid email or password', 401);
    }

    throw error;
  }

  try {
    const verified = await coreFetch<{ ok: boolean; user?: CoreAuthUser }>(
      '/internal/web/auth/verify',
      {
        method: 'POST',
        body: {
          email,
          password,
        },
        rid: requestId ?? undefined,
      },
    );
    verifiedUser = verified.user ?? null;
  } catch (error) {
    if (error instanceof CoreClientError && error.statusCode === 401) {
      return apiError('invalid_credentials', 'Invalid email or password', 401);
    }

    return apiError('core_auth_unavailable', 'Unable to verify account with core service', 503);
  }

  if (!verifiedUser) {
    return apiError('invalid_credentials', 'Invalid email or password', 401);
  }

  return Response.json({
    user: {
      id: verifiedUser.id,
      name: verifiedUser.name,
      email: verifiedUser.email,
    },
    role: verifiedUser.role,
    prefs: null,
  });
}
