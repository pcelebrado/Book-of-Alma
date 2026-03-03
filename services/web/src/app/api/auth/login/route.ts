import { AuthError } from 'next-auth';
import type { NextRequest } from 'next/server';

import { apiError, apiRateLimited, parseJsonBody } from '@/lib/api/response';
import { signIn } from '@/lib/auth/auth-config';
import { getUsersCollection } from '@/lib/db/collections';
import { logSecurityEvent, writeAuditLog } from '@/lib/logger';
import { RATE_LIMIT_RULES, enforceRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

interface LoginBody {
  email?: string;
  username?: string;
  password?: string;
  code?: string;
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

  const users = await getUsersCollection();
  const user = await users.findOne({ email });

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
      await writeAuditLog({
        action: 'login_fail',
        details: {
          requestId,
          email,
          reason: error.type,
        },
      });
      return apiError('invalid_credentials', 'Invalid email or password', 401);
    }

    throw error;
  }

  if (!user) {
    return apiError('invalid_credentials', 'Invalid email or password', 401);
  }

  return Response.json({
    user: {
      id: user._id.toHexString(),
      name: user.name,
      email: user.email,
    },
    role: user.role,
    prefs: user.prefs ?? null,
  });
}
