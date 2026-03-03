import { REQUEST_ID_HEADER, resolveRequestId } from '@/lib/auth/request-id';
import { signServiceToken } from '@/lib/auth/service-token';
import { getCoreBaseUrl, getServiceToken } from '@/lib/env';
import { logSecurityEvent } from '@/lib/logger';

const DEFAULT_TIMEOUT_MS = 5_000;

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
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const abortController = new AbortController();
  const timeoutHandle = setTimeout(() => abortController.abort(), timeoutMs);

  try {
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

    const response = await fetch(new URL(path, baseUrl), {
      method: options.method ?? 'GET',
      headers,
      body: hasBody ? JSON.stringify(options.body) : undefined,
      signal: abortController.signal,
      cache: 'no-store',
    });

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
    clearTimeout(timeoutHandle);
  }
}
