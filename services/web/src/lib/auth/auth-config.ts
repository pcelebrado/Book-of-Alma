import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';

import { getAuthSecret } from '@/lib/env';
import { logSecurityEvent } from '@/lib/logger';
import { verifyPassword } from '@/lib/auth/session';
import { getUsersCollection } from '@/lib/db/collections';

type Role = 'admin' | 'user';

interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export const {
  handlers,
  auth,
  signIn,
  signOut,
} = NextAuth({
  session: {
    strategy: 'jwt',
    maxAge: 60 * 60 * 24 * 7,
  },
  secret: getAuthSecret() || undefined,
  trustHost: true,
  pages: {
    signIn: '/login',
  },
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      authorize: async (credentials, request) => {
        const email = String(credentials?.email ?? '').trim().toLowerCase();
        const password = String(credentials?.password ?? '');
        const requestId = request?.headers?.get('x-request-id') ?? null;

        if (!email || !password) {
          await logSecurityEvent('auth.login.fail', {
            requestId,
            route: '/api/auth/login',
            details: { reason: 'missing_credentials', email },
          });
          return null;
        }

        try {
          const users = await getUsersCollection();
          const user = await users.findOne({ email });

          if (!user || !verifyPassword(password, user as Record<string, unknown>)) {
            await logSecurityEvent('auth.login.fail', {
              requestId,
              route: '/api/auth/login',
              details: { reason: 'invalid_credentials', email },
            });
            return null;
          }

          await users.updateOne(
            { _id: user._id },
            { $set: { lastLoginAt: new Date(), updatedAt: new Date() } },
          );

          await logSecurityEvent('auth.login.success', {
            requestId,
            route: '/api/auth/login',
            userId: user._id.toHexString(),
            details: { role: user.role },
          });

          return {
            id: user._id.toHexString(),
            email: user.email,
            name: user.name,
            role: user.role,
          } satisfies AuthUser;
        } catch (error) {
          await logSecurityEvent('mongo.connect.fail', {
            requestId,
            route: '/api/auth/login',
            details: {
              reason: 'authorize_user_lookup_failed',
              message: error instanceof Error ? error.message : 'unknown_error',
            },
          });

          await logSecurityEvent('auth.login.fail', {
            requestId,
            route: '/api/auth/login',
            details: { reason: 'lookup_failed', email },
          });
          return null;
        }
      },
    }),
  ],
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) {
        token.sub = user.id;
        token.email = user.email;
        token.name = user.name;
        token.role = (user as AuthUser).role;
      }

      return token;
    },
    session: async ({ session, token }) => {
      if (session.user) {
        session.user.id = String(token.sub ?? '');
        session.user.role = token.role === 'admin' ? 'admin' : 'user';
      }

      return session;
    },
  },
});

export async function getSessionUser(): Promise<AuthUser | null> {
  const session = await auth();
  if (!session?.user) {
    return null;
  }

  const id = typeof session.user.id === 'string' ? session.user.id : '';
  const email = typeof session.user.email === 'string' ? session.user.email : '';
  const name = typeof session.user.name === 'string' ? session.user.name : '';
  const role = session.user.role === 'admin' ? 'admin' : session.user.role === 'user' ? 'user' : null;

  if (!id || !email || !name || !role) {
    return null;
  }

  return { id, email, name, role };
}
