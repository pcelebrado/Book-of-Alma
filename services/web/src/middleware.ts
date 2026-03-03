import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

const REQUEST_ID_HEADER = 'X-Request-Id';

const PROTECTED_PATH_PREFIXES = [
  '/',
  '/book',
  '/notes',
  '/playbooks',
  '/admin',
  '/dashboard',
  '/journal',
  '/alerts',
];

const PUBLIC_PATH_PREFIXES = ['/login', '/onboarding', '/api/auth', '/_next', '/favicon.ico'];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isProtectedPath(pathname: string): boolean {
  if (pathname === '/') {
    return true;
  }

  return PROTECTED_PATH_PREFIXES.some(
    (prefix) => prefix !== '/' && (pathname === prefix || pathname.startsWith(`${prefix}/`)),
  );
}

export async function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  const requestId = requestHeaders.get(REQUEST_ID_HEADER) ?? crypto.randomUUID();
  requestHeaders.set(REQUEST_ID_HEADER, requestId);

  const pathname = request.nextUrl.pathname;
  const requiresAuth = isProtectedPath(pathname) && !isPublicPath(pathname);

  if (requiresAuth) {
    const token = await getToken({
      req: request,
      secret: process.env.AUTH_SECRET,
    });

    if (!token) {
      const redirectUrl = new URL('/login', request.url);
      redirectUrl.searchParams.set('next', pathname);
      const redirect = NextResponse.redirect(redirectUrl);
      redirect.headers.set(REQUEST_ID_HEADER, requestId);
      return redirect;
    }
  }

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
