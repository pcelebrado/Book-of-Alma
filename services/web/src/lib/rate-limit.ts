/**
 * Rate limiting for OpenClaw Web Service.
 * DECISION_197 follow-up: uses core-backed rate limit store.
 */
import { coreFetch } from '@/lib/core-client';

export interface RateLimitRule {
  keyPrefix: 'login:ip' | 'agent:user' | 'search:user' | 'admin:user';
  limit: number;
  windowSeconds: number;
  message: string;
}

interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
  count: number;
}

function buildWindowStart(windowSeconds: number, at = Date.now()): number {
  const seconds = Math.floor(at / 1000);
  return Math.floor(seconds / windowSeconds) * windowSeconds;
}

function buildRetryAfter(windowStart: number, windowSeconds: number, at = Date.now()): number {
  const nowSeconds = Math.floor(at / 1000);
  return Math.max(1, windowStart + windowSeconds - nowSeconds);
}

export async function enforceRateLimit(
  rule: RateLimitRule,
  keyValue: string,
): Promise<RateLimitResult> {
  const windowStart = buildWindowStart(rule.windowSeconds);
  const key = `${rule.keyPrefix}:${keyValue}`;

  const result = await coreFetch<{ count: number }, { key: string; windowStart: number }>(
    '/internal/web/rate-limit/increment',
    {
      method: 'POST',
      body: {
        key,
        windowStart,
      },
    },
  );
  const count = result.count;
  const retryAfterSeconds = buildRetryAfter(windowStart, rule.windowSeconds);

  return {
    allowed: count <= rule.limit,
    retryAfterSeconds,
    count,
  };
}

export const RATE_LIMIT_RULES = {
  login: {
    keyPrefix: 'login:ip',
    limit: 5,
    windowSeconds: 15 * 60,
    message: 'Too many attempts. Try again in 15 minutes.',
  } satisfies RateLimitRule,
  agentMinute: {
    keyPrefix: 'agent:user',
    limit: 10,
    windowSeconds: 60,
    message: 'You\'ve hit the assistant limit. Try again soon.',
  } satisfies RateLimitRule,
  agentHour: {
    keyPrefix: 'agent:user',
    limit: 100,
    windowSeconds: 60 * 60,
    message: 'You\'ve hit the assistant limit. Try again soon.',
  } satisfies RateLimitRule,
  search: {
    keyPrefix: 'search:user',
    limit: 30,
    windowSeconds: 60,
    message: 'Search is busy. Try again soon.',
  } satisfies RateLimitRule,
  admin: {
    keyPrefix: 'admin:user',
    limit: 5,
    windowSeconds: 60,
    message: 'Too many admin actions. Try again shortly.',
  } satisfies RateLimitRule,
};
