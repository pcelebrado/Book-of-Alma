import type { NextRequest } from 'next/server';

import { isAdmin, requireSession } from '@/lib/api/auth-guards';
import { apiError, parseJsonBody } from '@/lib/api/response';
import { coreFetch, CoreClientError } from '@/lib/core-client';

export const dynamic = 'force-dynamic';

interface OAuthCompleteRequestBody {
  flowId?: string;
  completionToken?: string;
  authorizationInput?: string;
  redirectUrl?: string;
  callbackUrl?: string;
  code?: string;
  payload?: {
    flow?: string;
    authChoice?: string;
    authSecret?: string;
    telegramToken?: string;
    discordToken?: string;
    slackBotToken?: string;
    slackAppToken?: string;
    customProviderId?: string;
    customProviderBaseUrl?: string;
    customProviderApi?: string;
    customProviderApiKeyEnv?: string;
    customProviderModelId?: string;
  };
}

export async function POST(request: NextRequest) {
  const { session } = await requireSession(request);
  if (!session) return apiError('unauthorized', 'Not authenticated', 401);
  if (!isAdmin(session)) return apiError('forbidden', 'Admin role required', 403);

  const body = (await parseJsonBody<OAuthCompleteRequestBody>(request)) ?? {};

  try {
    const payload = await coreFetch('/internal/openclaw/setup/oauth/complete', {
      method: 'POST',
      body,
      uid: session.id,
      role: session.role,
      rid: request.headers.get('x-request-id') ?? undefined,
      timeoutMs: 180_000,
    });
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
