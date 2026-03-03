import { createHash } from 'node:crypto';

import { SignJWT, jwtVerify } from 'jose';
import type { NextRequest, NextResponse } from 'next/server';

import { getAuthSecret } from '@/lib/env';

export const SESSION_COOKIE_NAME = 'openclaw_session';

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
}

function getSessionKey() {
  const secret = getAuthSecret();
  if (!secret) {
    throw new Error('Missing AUTH_SECRET');
  }

  return new TextEncoder().encode(secret);
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({
    email: user.email,
    name: user.name,
    role: user.role,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer('web')
    .setAudience('web')
    .setSubject(user.id)
    .setIssuedAt(now)
    .setExpirationTime(now + SESSION_TTL_SECONDS)
    .sign(getSessionKey());
}

export async function readSession(request: NextRequest): Promise<SessionUser | null> {
  const raw = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(raw, getSessionKey(), {
      issuer: 'web',
      audience: 'web',
    });

    const sub = payload.sub;
    const email = payload.email;
    const name = payload.name;
    const role = payload.role;

    if (
      typeof sub !== 'string' ||
      typeof email !== 'string' ||
      typeof name !== 'string' ||
      (role !== 'admin' && role !== 'user')
    ) {
      return null;
    }

    return {
      id: sub,
      email,
      name,
      role,
    };
  } catch {
    return null;
  }
}

export function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

export function verifyPassword(password: string, user: Record<string, unknown>): boolean {
  const plain = user.password;
  if (typeof plain === 'string' && plain === password) {
    return true;
  }

  const digest = createHash('sha256').update(password).digest('hex');

  const hash = user.passwordHash;
  if (typeof hash === 'string' && (hash === password || hash === digest)) {
    return true;
  }

  return false;
}
