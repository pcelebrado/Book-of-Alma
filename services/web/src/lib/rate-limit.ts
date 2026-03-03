import type { Collection } from 'mongodb';

import { getMongoDb } from '@/lib/db/mongo';

export interface RateLimitRule {
  keyPrefix: 'login:ip' | 'agent:user' | 'search:user' | 'admin:user';
  limit: number;
  windowSeconds: number;
  message: string;
}

interface RateLimitDocument {
  key: string;
  windowStart: number;
  count: number;
  createdAt: Date;
}

interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
  count: number;
}

let indexesReady = false;

async function getRateLimitCollection(): Promise<Collection<RateLimitDocument>> {
  const db = await getMongoDb();
  return db.collection<RateLimitDocument>('rate_limits');
}

async function ensureIndexes(collection: Collection<RateLimitDocument>) {
  if (indexesReady) {
    return;
  }

  await collection.createIndex({ key: 1, windowStart: 1 }, { unique: true });
  await collection.createIndex({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 2 });
  indexesReady = true;
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
  const collection = await getRateLimitCollection();
  await ensureIndexes(collection);

  const windowStart = buildWindowStart(rule.windowSeconds);
  const key = `${rule.keyPrefix}:${keyValue}`;

  await collection.updateOne(
    { key, windowStart },
    {
      $inc: { count: 1 },
      $setOnInsert: {
        key,
        windowStart,
        createdAt: new Date(windowStart * 1000),
      },
    },
    { upsert: true },
  );

  const doc = await collection.findOne({ key, windowStart }, { projection: { count: 1 } });
  const count = doc?.count ?? 0;
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
