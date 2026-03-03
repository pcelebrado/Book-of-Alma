import { randomUUID } from 'node:crypto';

import { SignJWT } from 'jose';

import { getJwtSigningKeys } from '@/lib/env';

export interface ServiceTokenPayload {
  sub?: string;
  uid?: string;
  role?: 'admin' | 'user';
  rid?: string;
  ttlSeconds?: number;
}

const DEFAULT_SUBJECT = 'web-service';
const MIN_TTL_SECONDS = 5 * 60;
const MAX_TTL_SECONDS = 15 * 60;
const DEFAULT_TTL_SECONDS = 10 * 60;

function getTtlSeconds(ttlSeconds?: number): number {
  if (!ttlSeconds) {
    return DEFAULT_TTL_SECONDS;
  }

  if (ttlSeconds < MIN_TTL_SECONDS) {
    return MIN_TTL_SECONDS;
  }

  if (ttlSeconds > MAX_TTL_SECONDS) {
    return MAX_TTL_SECONDS;
  }

  return ttlSeconds;
}

function getActiveSigningKey() {
  const keys = getJwtSigningKeys();
  if (keys.length === 0) {
    throw new Error('Missing INTERNAL_JWT_SIGNING_KEYS or INTERNAL_JWT_SIGNING_KEY');
  }

  return keys.find((key) => key.active) ?? keys[0];
}

export async function signServiceToken(payload: ServiceTokenPayload = {}): Promise<string> {
  const key = getActiveSigningKey();
  const now = Math.floor(Date.now() / 1000);
  const ttlSeconds = getTtlSeconds(payload.ttlSeconds);

  const tokenPayload: Record<string, string> = {};
  if (payload.uid) {
    tokenPayload.uid = payload.uid;
  }
  if (payload.role) {
    tokenPayload.role = payload.role;
  }
  if (payload.rid) {
    tokenPayload.rid = payload.rid;
  }

  return new SignJWT(tokenPayload)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT', kid: key.kid })
    .setIssuer('web')
    .setAudience('core')
    .setSubject(payload.sub ?? DEFAULT_SUBJECT)
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .setJti(randomUUID())
    .sign(new TextEncoder().encode(key.secret));
}
