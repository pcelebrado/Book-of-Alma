import { NextResponse } from 'next/server';

type ErrorDetails = Record<string, unknown> | string | number | boolean | null;

export function apiError(
  code: string,
  message: string,
  status = 400,
  details?: ErrorDetails,
  init?: ResponseInit,
) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        ...(typeof details === 'undefined' ? {} : { details }),
      },
    },
    { status, headers: init?.headers },
  );
}

export function apiRateLimited(message: string, retryAfterSeconds: number) {
  return apiError('rate_limited', message, 429, { retryAfterSeconds }, {
    headers: {
      'Retry-After': String(retryAfterSeconds),
    },
  });
}

export async function parseJsonBody<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}
