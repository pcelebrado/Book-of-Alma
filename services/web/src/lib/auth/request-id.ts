import { randomUUID } from 'node:crypto';

export const REQUEST_ID_HEADER = 'X-Request-Id';

export function createRequestId(): string {
  return randomUUID();
}

export function resolveRequestId(requestId?: string | null): string {
  if (requestId && requestId.trim().length > 0) {
    return requestId;
  }

  return createRequestId();
}
