import type { NextRequest } from 'next/server';

import { apiError, parseJsonBody } from '@/lib/api/response';
import { coreFetch, CoreClientError } from '@/lib/core-client';

export const dynamic = 'force-dynamic';

interface PublicOAuthCompleteRequestBody {
  flowId?: string;
  completionToken?: string;
  authorizationInput?: string;
  redirectUrl?: string;
  callbackUrl?: string;
  code?: string;
  state?: string;
}

function resolveAuthorizationInputFromRequest(
  request: NextRequest,
  body?: PublicOAuthCompleteRequestBody | null,
): string {
  const candidates = [
    body?.authorizationInput,
    body?.redirectUrl,
    body?.callbackUrl,
    body?.code,
    request.nextUrl.searchParams.get('authorizationInput') ?? undefined,
    request.nextUrl.searchParams.get('redirectUrl') ?? undefined,
    request.nextUrl.searchParams.get('callbackUrl') ?? undefined,
  ];

  for (const candidate of candidates) {
    const value = String(candidate ?? '').trim();
    if (value) return value;
  }

  if (request.nextUrl.searchParams.get('code')) {
    return request.nextUrl.toString();
  }

  return '';
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function oauthHtml(status: number, title: string, message: string) {
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="font-family: sans-serif; padding: 24px; line-height: 1.5;">
  <h1 style="margin: 0 0 12px;">${escapeHtml(title)}</h1>
  <p style="margin: 0;">${escapeHtml(message)}</p>
</body>
</html>`;

  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

async function forwardCompletion(
  flowId: string,
  completionToken: string,
  authorizationInput: string,
) {
  return coreFetch('/internal/openclaw/setup/oauth/complete', {
    method: 'POST',
    body: {
      flowId,
      completionToken,
      authorizationInput,
    },
    timeoutMs: 180_000,
  });
}

export async function GET(request: NextRequest) {
  const flowId = request.nextUrl.searchParams.get('flowId')?.trim() ?? '';
  const completionToken = request.nextUrl.searchParams.get('completionToken')?.trim() ?? '';
  const authorizationInput = resolveAuthorizationInputFromRequest(request);

  if (!flowId || !completionToken || !authorizationInput) {
    return oauthHtml(
      400,
      'OAuth completion failed',
      'Missing flowId, completionToken, or callback data.',
    );
  }

  try {
    await forwardCompletion(flowId, completionToken, authorizationInput);
    return oauthHtml(
      200,
      'OAuth completed',
      'Authentication has been forwarded to OpenClaw. Return to the admin UI.',
    );
  } catch (error) {
    const message =
      error instanceof CoreClientError
        ? (() => {
            const details = error.details as
              | { output?: string; error?: { message?: string } }
              | string
              | undefined;
            return typeof details === 'string'
              ? details
              : details?.output ?? details?.error?.message ?? error.message;
          })()
        : 'Unable to complete OAuth';
    return oauthHtml(500, 'OAuth completion failed', message);
  }
}

export async function POST(request: NextRequest) {
  const body = (await parseJsonBody<PublicOAuthCompleteRequestBody>(request)) ?? {};
  const flowId = String(body.flowId ?? '').trim();
  const completionToken = String(body.completionToken ?? '').trim();
  const authorizationInput = resolveAuthorizationInputFromRequest(request, body);

  if (!flowId) return apiError('missing_flow_id', 'flowId is required', 400);
  if (!completionToken) return apiError('missing_completion_token', 'completionToken is required', 400);
  if (!authorizationInput) return apiError('missing_authorization_input', 'authorizationInput is required', 400);

  try {
    const payload = await forwardCompletion(flowId, completionToken, authorizationInput);
    return Response.json(payload);
  } catch (error) {
    if (error instanceof CoreClientError) {
      const details = error.details as
        | { output?: string; error?: { message?: string } }
        | string
        | undefined;

      const detailedMessage =
        typeof details === 'string'
          ? details
          : details?.output ?? details?.error?.message ?? error.message;

      return apiError('core_unavailable', detailedMessage, error.statusCode, {
        requestId: error.requestId,
        details: error.details,
        message: detailedMessage,
      });
    }

    return apiError('internal_error', 'Unable to complete OAuth', 500);
  }
}
