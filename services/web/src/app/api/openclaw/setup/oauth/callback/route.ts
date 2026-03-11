import type { NextRequest } from 'next/server';

import { coreFetch, CoreClientError } from '@/lib/core-client';

export const dynamic = 'force-dynamic';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function serializeForScript(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}

function renderCallbackPage(request: NextRequest, params: { ok: boolean; title: string; message: string }) {
  const payload = {
    type: 'openclaw-oauth-complete',
    ok: params.ok,
    title: params.title,
    message: params.message,
  };
  const origin = request.nextUrl.origin;
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(params.title)}</title>
</head>
<body style="font-family: sans-serif; padding: 24px; line-height: 1.5;">
  <h1 style="margin: 0 0 12px;">${escapeHtml(params.title)}</h1>
  <p style="margin: 0;">${escapeHtml(params.message)}</p>
  <script>
    const payload = ${serializeForScript(payload)};
    if (window.opener && window.opener !== window) {
      window.opener.postMessage(payload, ${serializeForScript(origin)});
      setTimeout(() => window.close(), 150);
    }
  </script>
</body>
</html>`;

  return new Response(html, {
    status: params.ok ? 200 : 500,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export async function GET(request: NextRequest) {
  try {
    await coreFetch('/internal/openclaw/setup/oauth/complete', {
      method: 'POST',
      body: {
        authorizationInput: request.nextUrl.toString(),
      },
      timeoutMs: 180_000,
    });

    return renderCallbackPage(request, {
      ok: true,
      title: 'OAuth completed',
      message: 'Authentication has been captured. Return to the admin UI.',
    });
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

    return renderCallbackPage(request, {
      ok: false,
      title: 'OAuth completion failed',
      message,
    });
  }
}
