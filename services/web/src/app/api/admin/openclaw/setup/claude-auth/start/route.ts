import type { NextRequest } from 'next/server';

import { isAdmin, requireSession } from '@/lib/api/auth-guards';
import { apiError, parseJsonBody } from '@/lib/api/response';
import { coreFetch, CoreClientError } from '@/lib/core-client';
import { getCorePublicUrl } from '@/lib/env';

export const dynamic = 'force-dynamic';

interface ClaudeAuthStartRequestBody {
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
}

export async function POST(request: NextRequest) {
  const { session } = await requireSession(request);
  if (!session) return apiError('unauthorized', 'Not authenticated', 401);
  if (!isAdmin(session)) return apiError('forbidden', 'Admin role required', 403);

  const requestBody = (await parseJsonBody<ClaudeAuthStartRequestBody>(request)) ?? {};
  const corePublicUrl = getCorePublicUrl().trim();
  if (!corePublicUrl) {
    return apiError(
      'core_public_url_missing',
      'CORE_PUBLIC_URL or RAILWAY_SERVICE_OPENCLAW_CORE_URL is required for hosted Claude auth.',
      500,
    );
  }

  try {
    const payload = await coreFetch('/internal/openclaw/setup/claude-auth/start', {
      method: 'POST',
      body: {
        ...requestBody,
        returnOrigin: request.nextUrl.origin,
      },
      uid: session.id,
      role: session.role,
      rid: request.headers.get('x-request-id') ?? undefined,
      timeoutMs: 45_000,
    });

    const responseBody = payload as {
      flowId?: string;
      completionToken?: string;
    } & Record<string, unknown>;
    const flowId = typeof responseBody.flowId === 'string' ? responseBody.flowId : '';
    const completionToken =
      typeof responseBody.completionToken === 'string' ? responseBody.completionToken : '';
    const portalUrl =
      flowId && completionToken
        ? `${corePublicUrl.replace(/\/$/, '')}/claude-auth?flowId=${encodeURIComponent(flowId)}&completionToken=${encodeURIComponent(completionToken)}`
        : null;

    return Response.json({
      ...responseBody,
      portalUrl,
    });
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

    return apiError('internal_error', 'Unable to start Claude auth', 500);
  }
}
