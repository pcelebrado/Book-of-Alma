import { createHash } from 'node:crypto';

import type { NextRequest } from 'next/server';

import { apiError, apiRateLimited, parseJsonBody } from '@/lib/api/response';
import { signIn } from '@/lib/auth/auth-config';
import { getUsersCollection } from '@/lib/db/collections';
import { logSecurityEvent } from '@/lib/logger';
import { RATE_LIMIT_RULES, enforceRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

interface RegisterBody {
  name?: string;
  email?: string;
  password?: string;
  learningGoal?: string;
  notificationChannel?: { type?: string; value?: string };
  riskGuardrails?: {
    maxTradesPerDay?: number;
    maxLossPerDay?: number;
    cooldownMinutes?: number;
  };
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
  const existing = await users.findOne({ email });
  if (existing) {
    return apiError('email_taken', 'An account with that email already exists', 409);
  }

  const now = new Date();
  const userCount = await users.countDocuments();

  const channelType = String(body?.notificationChannel?.type ?? 'none').trim();
  const channelValue = String(body?.notificationChannel?.value ?? '').trim();
  const learningGoal = String(body?.learningGoal ?? '').trim();
  const guardrails = body?.riskGuardrails ?? {};

  const maxTradesPerDay = Number(guardrails.maxTradesPerDay ?? 3);
  const maxLossPerDay = Number(guardrails.maxLossPerDay ?? 500);
  const cooldownMinutes = Number(guardrails.cooldownMinutes ?? 60);

  const prefs: {
    learningGoal?: { sectionSlug: string };
    notificationChannel?: { type: string; value: string };
    riskGuardrails?: {
      maxTradesPerDay: number;
      maxLossPerDay: number;
      cooldownMinutes: number;
    };
  } = {};

  if (learningGoal) {
    prefs.learningGoal = { sectionSlug: learningGoal };
  }

  if (channelType && channelType !== 'none' && channelValue) {
    prefs.notificationChannel = {
      type: channelType,
      value: channelValue,
    };
  }

  prefs.riskGuardrails = {
    maxTradesPerDay: Number.isFinite(maxTradesPerDay) ? maxTradesPerDay : 3,
    maxLossPerDay: Number.isFinite(maxLossPerDay) ? maxLossPerDay : 500,
    cooldownMinutes: Number.isFinite(cooldownMinutes) ? cooldownMinutes : 60,
  };

  const result = await users.insertOne({
    name,
    email,
    role: userCount === 0 ? 'admin' : 'user',
    passwordHash: toPasswordHash(password),
    prefs,
    createdAt: now,
    updatedAt: now,
  } as never);

  await logSecurityEvent('auth.login.success', {
    requestId,
    route: '/api/auth/register',
    userId: result.insertedId.toHexString(),
    ip,
    details: {
      role: userCount === 0 ? 'admin' : 'user',
      source: 'onboarding_register',
    },
  });

  await signIn('credentials', {
    email,
    password,
    redirect: false,
  });

  return Response.json({
    ok: true,
    user: {
      id: result.insertedId.toHexString(),
      name,
      email,
    },
    role: userCount === 0 ? 'admin' : 'user',
  });
}
