import { createHash } from 'node:crypto';

import type { NextRequest } from 'next/server';

import { apiError, apiRateLimited, parseJsonBody } from '@/lib/api/response';
import { getUsersCollection } from '@/lib/db/collections';
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

function toPasswordHash(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

export async function GET() {
  const users = await getUsersCollection();
  const userCount = await users.countDocuments();
  return Response.json({
    onboardingOpen: userCount === 0,
    userCount,
  });
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

  const users = await getUsersCollection();
  const userCount = await users.countDocuments();

  if (userCount > 0) {
    return apiError('onboarding_closed', 'Initial admin has already been created', 403);
  }

  const existing = await users.findOne({ email });
  if (existing) {
    return apiError('email_taken', 'An account with that email already exists', 409);
  }

  const now = new Date();

  const result = await users.insertOne({
    name,
    email,
    role: 'admin',
    passwordHash: toPasswordHash(password),
    createdAt: now,
    updatedAt: now,
  } as never);

  await logSecurityEvent('auth.login.success', {
    requestId,
    route: '/api/auth/register',
    userId: result.insertedId.toHexString(),
    ip,
    details: {
      role: 'admin',
      source: 'onboarding_register',
    },
  });

  return Response.json({
    ok: true,
    user: {
      id: result.insertedId.toHexString(),
      name,
      email,
    },
    role: 'admin',
  });
}
