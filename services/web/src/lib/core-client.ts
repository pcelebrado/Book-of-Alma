import { REQUEST_ID_HEADER, resolveRequestId } from '@/lib/auth/request-id';
import { signServiceToken } from '@/lib/auth/service-token';
import { getCoreBaseUrl, getCorePublicUrl, getServiceToken } from '@/lib/env';
import { logSecurityEvent } from '@/lib/logger';

const DEFAULT_TIMEOUT_MS = 12_000;
const RETRY_TIMEOUT_MS = 30_000;

async function wakeCoreFromPublicEdge(requestId: string, route: string) {
  const publicUrl = getCorePublicUrl();
  if (!publicUrl) {
    return;
  }

  const wakeAbort = new AbortController();
  const wakeTimeout = setTimeout(() => wakeAbort.abort(), 10_000);

  try {
    await fetch(new URL('/healthz', publicUrl), {
      method: 'GET',
      cache: 'no-store',
      signal: wakeAbort.signal,
    });

    await logSecurityEvent('core.wake_probe.sent', {
      requestId,
      route,
      details: {
        publicUrl,
      },
    });
  } catch {
    // Wake probe is best-effort only.
  } finally {
    clearTimeout(wakeTimeout);
  }
}

export class CoreClientError extends Error {
  statusCode: number;
  requestId: string;
  details?: unknown;

  constructor(message: string, statusCode: number, requestId: string, details?: unknown) {
    super(message);
    this.name = 'CoreClientError';
    this.statusCode = statusCode;
    this.requestId = requestId;
    this.details = details;
  }
}

type CoreMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface CoreFetchOptions<TBody = unknown> {
  method?: CoreMethod;
  body?: TBody;
  headers?: HeadersInit;
  timeoutMs?: number;
  sub?: string;
  uid?: string;
  role?: 'admin' | 'user';
  rid?: string;
}

async function getBearerToken(options: Pick<CoreFetchOptions, 'sub' | 'uid' | 'role' | 'rid'>) {
  const staticToken = getServiceToken();
  if (staticToken) {
    return staticToken;
  }

  return signServiceToken({
    sub: options.sub,
    uid: options.uid,
    role: options.role,
    rid: options.rid,
  });
}

async function readErrorBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return response.json();
  }

  return response.text();
}

export async function coreFetch<TResponse = unknown, TBody = unknown>(
  path: string,
  options: CoreFetchOptions<TBody> = {},
): Promise<TResponse> {
  const baseUrl = getCoreBaseUrl();
  if (!baseUrl) {
    throw new Error('Missing INTERNAL_CORE_BASE_URL');
  }

  const requestId = resolveRequestId(options.rid);
  const token = await getBearerToken({
    sub: options.sub,
    uid: options.uid,
    role: options.role,
    rid: requestId,
  });

  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${token}`);
  headers.set(REQUEST_ID_HEADER, requestId);

  if (options.uid) {
    headers.set('X-User-Id', options.uid);
  }

  if (options.role) {
    headers.set('X-User-Role', options.role);
  }

  const hasBody = typeof options.body !== 'undefined';
  if (hasBody && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const runAttempt = async (timeoutMs: number) => {
    const abortController = new AbortController();
    const timeoutHandle = setTimeout(() => abortController.abort(), timeoutMs);

    try {
      return await fetch(new URL(path, baseUrl), {
        method: options.method ?? 'GET',
        headers,
        body: hasBody ? JSON.stringify(options.body) : undefined,
        signal: abortController.signal,
        cache: 'no-store',
      });
    } finally {
      clearTimeout(timeoutHandle);
    }
  };

  try {
    let response: Response;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    try {
      response = await runAttempt(timeoutMs);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        await wakeCoreFromPublicEdge(requestId, path);
        response = await runAttempt(Math.max(timeoutMs, RETRY_TIMEOUT_MS));
      } else if (error instanceof TypeError) {
        await wakeCoreFromPublicEdge(requestId, path);
        response = await runAttempt(Math.max(timeoutMs, RETRY_TIMEOUT_MS));
      } else {
        throw error;
      }
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        await logSecurityEvent('internal.core.auth_fail', {
          requestId,
          route: path,
          details: {
            statusCode: response.status,
          },
        });
      }

      throw new CoreClientError(
        `Core request failed with status ${response.status}`,
        response.status,
        requestId,
        await readErrorBody(response),
      );
    }

    if (response.status === 204) {
      return undefined as TResponse;
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      return (await response.json()) as TResponse;
    }

    return (await response.text()) as TResponse;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      await logSecurityEvent('core.unavailable', {
        requestId,
        route: path,
        details: {
          reason: 'timeout',
        },
      });
      throw new CoreClientError('Core request timed out', 504, requestId);
    }

    if (error instanceof TypeError) {
      await logSecurityEvent('core.unavailable', {
        requestId,
        route: path,
        details: {
          reason: 'network_failure',
          message: error.message,
        },
      });
      throw new CoreClientError('Core request failed', 503, requestId, {
        cause: error.message,
      });
    }

    throw error;
  } finally {
    // no-op; per-attempt timers are cleared in runAttempt()
  }
}
