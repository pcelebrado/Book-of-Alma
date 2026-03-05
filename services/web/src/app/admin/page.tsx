'use client';

import { AlertTriangle, Loader2, Play, RefreshCw, RotateCcw, Square, Terminal } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AdminStatusPayload {
  mongo?: string;
  core?: string;
  components?: Record<string, string>;
  lastReindexRun?: { at?: string | null; details?: Record<string, unknown> | null };
  lastCoreHealthCheck?: string;
  lastCoreUnavailableAt?: string | null;
  lastMongoErrorAt?: string | null;
}

interface OpenClawSettingsPayload {
  configured: boolean;
  setupPasswordConfigured: boolean;
  gatewayTarget: string;
  settings: {
    authMode: string | null;
    bind: string | null;
    port: string | null;
    chatCompletionsEnabled: string | null;
    responsesEnabled: string | null;
  };
  secrets: {
    authTokenConfigured: boolean;
    remoteTokenConfigured: boolean;
  };
  channels: {
    telegram: string | null;
    discord: string | null;
    slack: string | null;
  };
  links?: {
    gateway: string | null;
    setup: string | null;
  };
  corePublicUrlConfigured?: boolean;
  corePublicUrlHint?: string | null;
}

interface AuthOption {
  value: string;
  label: string;
}

interface AuthGroup {
  value: string;
  label: string;
  hint?: string;
  options: AuthOption[];
}

interface SetupStatusPayload {
  ok: boolean;
  configured: boolean;
  gatewayTarget: string;
  openclawVersion: string;
  channelsAddHelp?: string;
  authGroups?: AuthGroup[];
}

// ---------------------------------------------------------------------------
// Fallback auth groups (mirrors core AUTH_GROUPS so onboarding works even
// when the core service is still starting / sleeping)
// ---------------------------------------------------------------------------

const FALLBACK_AUTH_GROUPS: AuthGroup[] = [
  { value: 'openai', label: 'OpenAI', hint: 'Codex OAuth + API key', options: [
    { value: 'codex-cli', label: 'OpenAI Codex OAuth (Codex CLI)' },
    { value: 'openai-codex', label: 'OpenAI Codex (ChatGPT OAuth)' },
    { value: 'openai-api-key', label: 'OpenAI API key' },
  ]},
  { value: 'anthropic', label: 'Anthropic', hint: 'Claude Code CLI + API key', options: [
    { value: 'claude-cli', label: 'Anthropic token (Claude Code CLI)' },
    { value: 'token', label: 'Anthropic token (paste setup-token)' },
    { value: 'apiKey', label: 'Anthropic API key' },
  ]},
  { value: 'google', label: 'Google', hint: 'Gemini API key + OAuth', options: [
    { value: 'gemini-api-key', label: 'Google Gemini API key' },
    { value: 'google-antigravity', label: 'Google Antigravity OAuth' },
    { value: 'google-gemini-cli', label: 'Google Gemini CLI OAuth' },
  ]},
  { value: 'openrouter', label: 'OpenRouter', hint: 'API key', options: [
    { value: 'openrouter-api-key', label: 'OpenRouter API key' },
  ]},
  { value: 'ai-gateway', label: 'Vercel AI Gateway', hint: 'API key', options: [
    { value: 'ai-gateway-api-key', label: 'Vercel AI Gateway API key' },
  ]},
  { value: 'moonshot', label: 'Moonshot AI', hint: 'Kimi K2 + Kimi Code', options: [
    { value: 'moonshot-api-key', label: 'Moonshot AI API key' },
    { value: 'kimi-code-api-key', label: 'Kimi Code API key' },
  ]},
  { value: 'zai', label: 'Z.AI (GLM 4.7)', hint: 'API key', options: [
    { value: 'zai-api-key', label: 'Z.AI (GLM 4.7) API key' },
  ]},
  { value: 'minimax', label: 'MiniMax', hint: 'M2.1 (recommended)', options: [
    { value: 'minimax-api', label: 'MiniMax M2.1' },
    { value: 'minimax-api-lightning', label: 'MiniMax M2.1 Lightning' },
  ]},
  { value: 'qwen', label: 'Qwen', hint: 'OAuth', options: [
    { value: 'qwen-portal', label: 'Qwen OAuth' },
  ]},
  { value: 'copilot', label: 'Copilot', hint: 'GitHub + local proxy', options: [
    { value: 'github-copilot', label: 'GitHub Copilot (GitHub device login)' },
    { value: 'copilot-proxy', label: 'Copilot Proxy (local)' },
  ]},
  { value: 'synthetic', label: 'Synthetic', hint: 'Anthropic-compatible (multi-model)', options: [
    { value: 'synthetic-api-key', label: 'Synthetic API key' },
  ]},
  { value: 'opencode-zen', label: 'OpenCode Zen', hint: 'API key', options: [
    { value: 'opencode-zen', label: 'OpenCode Zen (multi-model proxy)' },
  ]},
];

const INTERACTIVE_AUTH_CHOICES = new Set([
  'codex-cli',
  'openai-codex',
  'claude-cli',
  'google-antigravity',
  'google-gemini-cli',
  'qwen-portal',
  'github-copilot',
  'copilot-proxy',
]);

const SECRET_REQUIRED_CHOICES = new Set([
  'openai-api-key',
  'apiKey',
  'token',
  'openrouter-api-key',
  'ai-gateway-api-key',
  'moonshot-api-key',
  'kimi-code-api-key',
  'gemini-api-key',
  'zai-api-key',
  'minimax-api',
  'minimax-api-lightning',
  'synthetic-api-key',
  'opencode-zen',
]);

function isInteractiveAuthOption(option: AuthOption): boolean {
  return INTERACTIVE_AUTH_CHOICES.has(option.value);
}

function pickDefaultAuthOption(options: AuthOption[], includeInteractive: boolean): string {
  if (!options.length) return '';
  if (includeInteractive) return options[0]?.value ?? '';
  const nonInteractive = options.find((opt) => !isInteractiveAuthOption(opt));
  return nonInteractive?.value ?? options[0]?.value ?? '';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', ...opts });
  const raw = await res.text();

  let data: unknown = null;
  let parseError: Error | null = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch (error) {
    parseError = error instanceof Error ? error : new Error(String(error));
  }

  if (!res.ok) {
    const maybe = data as { error?: { message?: string }; output?: string } | null;
    const msg = maybe?.error?.message ?? maybe?.output ?? (raw || `HTTP ${res.status}`);

    if (parseError) {
      throw new Error(`HTTP ${res.status} (invalid JSON error payload): ${parseError.message}. Raw: ${raw.slice(0, 300)}`);
    }

    throw new Error(msg);
  }

  if (parseError) {
    throw new Error(`Invalid JSON success payload from ${url}: ${parseError.message}. Raw: ${raw.slice(0, 300)}`);
  }

  return data as T;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AdminPage() {
  // --- System status ---
  const [status, setStatus] = useState<AdminStatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // --- OpenClaw settings (quick view) ---
  const [settings, setSettings] = useState<OpenClawSettingsPayload | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  // --- Setup status (detailed) ---
  const [setupStatus, setSetupStatus] = useState<SetupStatusPayload | null>(null);

  // --- Onboarding ---
  const [authGroups, setAuthGroups] = useState<AuthGroup[]>(FALLBACK_AUTH_GROUPS);
  const [selectedGroup, setSelectedGroup] = useState(FALLBACK_AUTH_GROUPS[0]?.value ?? '');
  const [showAdvancedAuth, setShowAdvancedAuth] = useState(false);
  const [onboardFlow, setOnboardFlow] = useState<'quickstart' | 'manual'>('quickstart');
  const [selectedAuth, setSelectedAuth] = useState(
    pickDefaultAuthOption(FALLBACK_AUTH_GROUPS[0]?.options ?? [], false),
  );
  const [authSecret, setAuthSecret] = useState('');
  const [customProviderId, setCustomProviderId] = useState('');
  const [customProviderBaseUrl, setCustomProviderBaseUrl] = useState('');
  const [customProviderApi, setCustomProviderApi] = useState<'openai-completions' | 'openai-responses'>('openai-completions');
  const [customProviderApiKeyEnv, setCustomProviderApiKeyEnv] = useState('');
  const [customProviderModelId, setCustomProviderModelId] = useState('');
  const [telegramToken, setTelegramToken] = useState('');
  const [discordToken, setDiscordToken] = useState('');
  const [slackBotToken, setSlackBotToken] = useState('');
  const [slackAppToken, setSlackAppToken] = useState('');
  const [onboardLog, setOnboardLog] = useState('');
  const [onboarding, setOnboarding] = useState(false);

  // --- Config editor ---
  const [configContent, setConfigContent] = useState('');
  const [configPath, setConfigPath] = useState('');
  const [configExists, setConfigExists] = useState(false);
  const [configLoading, setConfigLoading] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);

  // --- Console ---
  const [consoleCmd, setConsoleCmd] = useState('openclaw.status');
  const [consoleArg, setConsoleArg] = useState('');
  const [consoleOutput, setConsoleOutput] = useState('');
  const [consoleRunning, setConsoleRunning] = useState(false);

  // --- Gateway controls ---
  const [gatewayBusy, setGatewayBusy] = useState(false);

  // --- Devices ---
  const [pendingDevices, setPendingDevices] = useState<string[]>([]);
  const [devicesOutput, setDevicesOutput] = useState('');
  const [devicesLoading, setDevicesLoading] = useState(false);

  // --- Pairing ---
  const [pairingChannel, setPairingChannel] = useState('telegram');
  const [pairingCode, setPairingCode] = useState('');
  const [pairingBusy, setPairingBusy] = useState(false);

  // --- Debug ---
  const [debugData, setDebugData] = useState<Record<string, unknown> | null>(null);
  const [debugLoading, setDebugLoading] = useState(false);

  // --- Reset ---
  const [resetting, setResetting] = useState(false);

  // --- Reindex ---
  const [reindexing, setReindexing] = useState(false);
  const [progress, setProgress] = useState(0);

  // Ref to track initial load
  const didInit = useRef(false);

  // -----------------------------------------------------------------------
  // Loaders
  // -----------------------------------------------------------------------

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<AdminStatusPayload>('/api/admin/status');
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load admin status');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    setSettingsError(null);
    try {
      const data = await apiFetch<OpenClawSettingsPayload>('/api/admin/openclaw/settings');
      setSettings(data);
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : 'Unable to load settings');
    }
  }, []);

  const loadSetupStatus = useCallback(async () => {
    try {
      const data = await apiFetch<SetupStatusPayload>('/api/admin/openclaw/setup/status');
      setSetupStatus(data);
      if (data.authGroups && data.authGroups.length > 0) {
        setAuthGroups(data.authGroups);
        const selectedExists = data.authGroups.some((group) => group.value === selectedGroup);
        if (!selectedGroup || !selectedExists) {
          const nextGroup = data.authGroups[0];
          setSelectedGroup(nextGroup.value);
          setSelectedAuth(pickDefaultAuthOption(nextGroup.options ?? [], showAdvancedAuth));
        }
      }
    } catch {
      // Setup status may fail if core is down; don't block
    }
  }, [selectedGroup, showAdvancedAuth]);

  const loadConfig = useCallback(async () => {
    setConfigLoading(true);
    try {
      const data = await apiFetch<{ ok: boolean; path: string; exists: boolean; content: string }>(
        '/api/admin/openclaw/setup/config/raw',
      );
      setConfigContent(data.content);
      setConfigPath(data.path);
      setConfigExists(data.exists);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load config');
    } finally {
      setConfigLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    void loadStatus();
    void loadSettings();
    void loadSetupStatus();
  }, [loadStatus, loadSettings, loadSetupStatus]);

  // -----------------------------------------------------------------------
  // Auth group → options
  // -----------------------------------------------------------------------

  const currentGroup = useMemo(
    () => authGroups.find((g) => g.value === selectedGroup),
    [authGroups, selectedGroup],
  );
  const authOptions = currentGroup?.options ?? [];
  const visibleAuthOptions = useMemo(
    () => (showAdvancedAuth ? authOptions : authOptions.filter((opt) => !isInteractiveAuthOption(opt))),
    [authOptions, showAdvancedAuth],
  );

  useEffect(() => {
    if (!visibleAuthOptions.length) {
      setSelectedAuth('');
      return;
    }
    const stillValid = visibleAuthOptions.some((opt) => opt.value === selectedAuth);
    if (!stillValid) {
      setSelectedAuth(pickDefaultAuthOption(authOptions, showAdvancedAuth));
    }
  }, [authOptions, selectedAuth, showAdvancedAuth, visibleAuthOptions]);

  const requiresAuthSecret = SECRET_REQUIRED_CHOICES.has(selectedAuth);
  const onboardingBlocked =
    onboarding ||
    (settings?.configured ?? setupStatus?.configured ?? false) ||
    !selectedGroup ||
    !selectedAuth ||
    (requiresAuthSecret && !authSecret.trim());

  // -----------------------------------------------------------------------
  // Actions
  // -----------------------------------------------------------------------

  const runOnboarding = async () => {
    if (!selectedAuth) {
      toast.error('Select an auth choice before running setup.');
      return;
    }
    if (requiresAuthSecret && !authSecret.trim()) {
      toast.error('This auth choice requires an API key / auth secret.');
      return;
    }
    setOnboarding(true);
    setOnboardLog('Running onboarding...\n');
    try {
      const data = await apiFetch<{ ok: boolean; output: string }>('/api/admin/openclaw/setup/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          flow: onboardFlow,
          authChoice: selectedAuth,
          authSecret,
          customProviderId,
          customProviderBaseUrl,
          customProviderApi,
          customProviderApiKeyEnv,
          customProviderModelId,
          telegramToken,
          discordToken,
          slackBotToken,
          slackAppToken,
        }),
      });
      setOnboardLog(data.output ?? JSON.stringify(data, null, 2));
      toast.success(data.ok ? 'Onboarding completed!' : 'Onboarding finished with issues');
      void loadSettings();
      void loadSetupStatus();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Onboarding failed';
      setOnboardLog((prev) => prev + '\nError: ' + msg);
      toast.error(msg);
    } finally {
      setOnboarding(false);
    }
  };

  const saveConfig = async () => {
    setConfigSaving(true);
    try {
      await apiFetch('/api/admin/openclaw/setup/config/raw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: configContent }),
      });
      toast.success('Config saved and gateway restarted.');
      void loadSettings();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save config');
    } finally {
      setConfigSaving(false);
    }
  };

  const runConsoleCommand = async () => {
    setConsoleRunning(true);
    try {
      const data = await apiFetch<{ ok: boolean; output?: string }>('/api/admin/openclaw/console/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cmd: consoleCmd, arg: consoleArg }),
      });
      setConsoleOutput(data.output ?? 'Command completed.');
      toast.success('Console command executed.');
      void loadSettings();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Console command failed';
      setConsoleOutput(msg);
      toast.error(msg);
    } finally {
      setConsoleRunning(false);
    }
  };

  const gatewayAction = async (action: 'restart' | 'stop' | 'start') => {
    setGatewayBusy(true);
    try {
      if (action === 'restart') {
        await apiFetch('/api/admin/openclaw/gateway/restart', { method: 'POST' });
      } else {
        await apiFetch('/api/admin/openclaw/console/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cmd: `gateway.${action}` }),
        });
      }
      toast.success(`Gateway ${action} triggered.`);
      void loadSettings();
      void loadStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Gateway ${action} failed`);
    } finally {
      setGatewayBusy(false);
    }
  };

  const loadDevices = async () => {
    setDevicesLoading(true);
    try {
      const data = await apiFetch<{ ok: boolean; requestIds: string[]; output: string }>(
        '/api/admin/openclaw/setup/devices/pending',
      );
      setPendingDevices(data.requestIds ?? []);
      setDevicesOutput(data.output ?? '');
    } catch (err) {
      setDevicesOutput(err instanceof Error ? err.message : 'Failed to load devices');
    } finally {
      setDevicesLoading(false);
    }
  };

  const approveDevice = async (requestId: string) => {
    try {
      await apiFetch('/api/admin/openclaw/setup/devices/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId }),
      });
      toast.success(`Device ${requestId} approved.`);
      void loadDevices();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Device approval failed');
    }
  };

  const approvePairing = async () => {
    if (!pairingCode.trim()) {
      toast.error('Enter a pairing code.');
      return;
    }
    setPairingBusy(true);
    try {
      await apiFetch('/api/admin/openclaw/setup/pairing/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: pairingChannel, code: pairingCode.trim() }),
      });
      toast.success(`Pairing approved for ${pairingChannel}.`);
      setPairingCode('');
      void loadSettings();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Pairing approval failed');
    } finally {
      setPairingBusy(false);
    }
  };

  const loadDebug = async () => {
    setDebugLoading(true);
    try {
      const data = await apiFetch<Record<string, unknown>>('/api/admin/openclaw/setup/debug');
      setDebugData(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Debug load failed');
    } finally {
      setDebugLoading(false);
    }
  };

  const resetSetup = async () => {
    setResetting(true);
    try {
      await apiFetch('/api/admin/openclaw/setup/reset', { method: 'POST' });
      toast.success('Setup reset. You can re-run onboarding now.');
      void loadSettings();
      void loadSetupStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setResetting(false);
    }
  };

  const triggerReindex = async () => {
    setReindexing(true);
    setProgress(25);
    try {
      await apiFetch('/api/admin/book/reindex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: true }),
      });
      setProgress(100);
      toast.success('Reindex started.');
      void loadStatus();
    } catch (err) {
      setProgress(0);
      toast.error(err instanceof Error ? err.message : 'Reindex failed');
    } finally {
      setReindexing(false);
      setTimeout(() => setProgress(0), 1200);
    }
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  const isConfigured = settings?.configured ?? setupStatus?.configured ?? false;

  return (
    <div className="space-y-6 pb-8">
      <div className="space-y-2">
        <h1 className="text-4xl leading-[1.1] tracking-[-0.02em] font-semibold">Admin</h1>
        <p className="text-sm leading-[1.6] text-muted-foreground">
          OpenClaw control center — onboarding, config, gateway, channels, diagnostics.
        </p>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load admin status.</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {settingsError ? (
        <Alert>
          <AlertTitle>Unable to load OpenClaw settings.</AlertTitle>
          <AlertDescription>{settingsError}</AlertDescription>
        </Alert>
      ) : null}
      {settings && !settings.links?.gateway ? (
        <Alert>
          <AlertTitle>Gateway URL not configured</AlertTitle>
          <AlertDescription>
            {settings.corePublicUrlHint ?? 'Set CORE_PUBLIC_URL in web service env so Admin can show gateway/setup buttons.'}
          </AlertDescription>
        </Alert>
      ) : null}

      {/* ----------------------------------------------------------------- */}
      {/* Status bar */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex flex-wrap gap-2 text-sm">
        <div className="flex items-center gap-2 rounded-md border px-3 py-2">
          <span className="font-medium">Configured</span>
          <Badge variant={isConfigured ? 'secondary' : 'destructive'}>
            {isConfigured ? 'yes' : 'no'}
          </Badge>
        </div>
        <div className="flex items-center gap-2 rounded-md border px-3 py-2">
          <span className="font-medium">Core</span>
          <Badge variant={status?.core === 'ok' ? 'secondary' : 'destructive'}>
            {status?.core ?? 'unknown'}
          </Badge>
        </div>
        <div className="flex items-center gap-2 rounded-md border px-3 py-2">
          <span className="font-medium">MongoDB</span>
          <Badge variant={status?.mongo === 'connected' ? 'secondary' : 'destructive'}>
            {status?.mongo ?? 'unknown'}
          </Badge>
        </div>
        <div className="flex items-center gap-2 rounded-md border px-3 py-2">
          <span className="font-medium">Version</span>
          <span className="text-xs text-muted-foreground">
            {setupStatus?.openclawVersion ?? '—'}
          </span>
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Main tabs */}
      {/* ----------------------------------------------------------------- */}
      <Tabs defaultValue={isConfigured ? 'overview' : 'onboarding'} className="space-y-4">
        <div className="overflow-x-auto">
          <TabsList className="inline-flex w-max">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="onboarding">Onboarding</TabsTrigger>
            <TabsTrigger value="config">Config</TabsTrigger>
            <TabsTrigger value="console">Console</TabsTrigger>
            <TabsTrigger value="gateway">Gateway</TabsTrigger>
            <TabsTrigger value="devices">Devices</TabsTrigger>
            <TabsTrigger value="channels">Channels</TabsTrigger>
            <TabsTrigger value="diagnostics">Diagnostics</TabsTrigger>
          </TabsList>
        </div>

        {/* ============================================================= */}
        {/* OVERVIEW TAB */}
        {/* ============================================================= */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>OpenClaw Settings</CardTitle>
                <CardDescription>Current gateway configuration and channel state.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="flex items-center justify-between rounded-md border p-2">
                    <span>Auth mode</span>
                    <span>{settings?.settings.authMode ?? '—'}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-md border p-2">
                    <span>Bind:Port</span>
                    <span>
                      {settings?.settings.bind ?? '—'}:{settings?.settings.port ?? '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-md border p-2">
                    <span>/v1/chat/completions</span>
                    <Badge
                      variant={
                        settings?.settings.chatCompletionsEnabled === 'true'
                          ? 'secondary'
                          : 'destructive'
                      }
                    >
                      {settings?.settings.chatCompletionsEnabled ?? 'unknown'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between rounded-md border p-2">
                    <span>/v1/responses</span>
                    <Badge
                      variant={
                        settings?.settings.responsesEnabled === 'true' ? 'secondary' : 'destructive'
                      }
                    >
                      {settings?.settings.responsesEnabled ?? 'unknown'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between rounded-md border p-2">
                    <span>Auth token</span>
                    <Badge variant={settings?.secrets.authTokenConfigured ? 'secondary' : 'destructive'}>
                      {settings?.secrets.authTokenConfigured ? 'set' : 'missing'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between rounded-md border p-2">
                    <span>Remote token</span>
                    <Badge variant={settings?.secrets.remoteTokenConfigured ? 'secondary' : 'destructive'}>
                      {settings?.secrets.remoteTokenConfigured ? 'set' : 'missing'}
                    </Badge>
                  </div>
                </div>

                <div className="rounded-md border p-3 text-xs">
                  <p>Gateway target: {settings?.gatewayTarget ?? '—'}</p>
                  <p>Telegram: {settings?.channels.telegram ?? 'not configured'}</p>
                  <p>Discord: {settings?.channels.discord ?? 'not configured'}</p>
                  <p>Slack: {settings?.channels.slack ?? 'not configured'}</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => void loadSettings()} disabled={loading}>
                    <RefreshCw className="mr-1 h-3 w-3" /> Refresh
                  </Button>
                  {settings?.links?.gateway ? (
                    <Button asChild variant="secondary" size="sm">
                      <a href={settings.links.gateway} target="_blank" rel="noreferrer">
                        Open Gateway UI
                      </a>
                    </Button>
                  ) : null}
                  {settings?.links?.setup ? (
                    <Button asChild variant="outline" size="sm">
                      <a href={settings.links.setup} target="_blank" rel="noreferrer">
                        Open Setup Wizard
                      </a>
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>System Status</CardTitle>
                <CardDescription>Health and reindex controls.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <div className="rounded-md border p-3 text-xs">
                  <p>Last core check: {status?.lastCoreHealthCheck ?? '—'}</p>
                  <p>Last core unavailable: {status?.lastCoreUnavailableAt ?? '—'}</p>
                  <p>Last reindex: {status?.lastReindexRun?.at ? new Date(status.lastReindexRun.at).toLocaleString() : '—'}</p>
                </div>
                <Separator />
                <div className="space-y-2">
                  <Progress value={progress} />
                  <Button size="sm" onClick={() => void triggerReindex()} disabled={reindexing || loading}>
                    {reindexing ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                    Reindex book
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ============================================================= */}
        {/* ONBOARDING TAB */}
        {/* ============================================================= */}
        <TabsContent value="onboarding" className="space-y-4">
          {isConfigured ? (
            <Alert>
              <AlertTitle>Already configured</AlertTitle>
              <AlertDescription>
                OpenClaw is already set up. Use the &quot;Reset&quot; action (Diagnostics tab) to delete the
                config and re-run onboarding.
              </AlertDescription>
            </Alert>
          ) : null}

          <Card>
              <CardHeader className="pb-2">
                <CardTitle>Onboarding Wizard</CardTitle>
                <CardDescription>
                  Run initial OpenClaw setup. Select an auth provider, enter your API key, and optionally
                  configure channel tokens.
                </CardDescription>
              </CardHeader>
            <CardContent className="space-y-6 text-sm">
              <Alert className="border-border/60">
                <AlertTitle>Onboarding guidance (doc-backed)</AlertTitle>
                <AlertDescription>
                  Prefer <strong>quickstart</strong> flow, API-key auth choices for non-interactive setup, and
                  keep gateway auth in token mode. Telegram token comes from @BotFather; Discord token comes
                  from the Discord Developer Portal bot settings.
                </AlertDescription>
              </Alert>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs font-medium" htmlFor="onboard-flow">
                    Onboarding Flow
                  </label>
                  <select
                    id="onboard-flow"
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={onboardFlow}
                    onChange={(e) => setOnboardFlow(e.target.value as 'quickstart' | 'manual')}
                  >
                    <option value="quickstart">quickstart (recommended)</option>
                    <option value="manual">manual (advanced)</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium" htmlFor="advanced-auth-toggle">
                    Auth Choice Visibility
                  </label>
                  <label className="flex h-10 items-center gap-2 rounded-md border px-3 text-sm" htmlFor="advanced-auth-toggle">
                    <input
                      id="advanced-auth-toggle"
                      type="checkbox"
                      checked={showAdvancedAuth}
                      onChange={(e) => setShowAdvancedAuth(e.target.checked)}
                    />
                    Show interactive OAuth options
                  </label>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs font-medium" htmlFor="auth-group">
                    Auth Provider Group
                  </label>
                  <select
                    id="auth-group"
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={selectedGroup}
                    onChange={(e) => {
                      setSelectedGroup(e.target.value);
                      const g = authGroups.find((ag) => ag.value === e.target.value);
                      const nextOptions = g?.options ?? [];
                      setSelectedAuth(pickDefaultAuthOption(nextOptions, showAdvancedAuth));
                    }}
                  >
                    {authGroups.map((g) => (
                      <option key={g.value} value={g.value}>
                        {g.label}
                        {g.hint ? ` — ${g.hint}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium" htmlFor="auth-choice">
                    Auth Choice
                  </label>
                  <select
                    id="auth-choice"
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={selectedAuth}
                    onChange={(e) => setSelectedAuth(e.target.value)}
                  >
                    {visibleAuthOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  {visibleAuthOptions.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No non-interactive choices available for this group. Enable interactive options above.
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium" htmlFor="auth-secret">
                  API Key / Auth Secret
                </label>
                <Input
                  id="auth-secret"
                  type="password"
                  placeholder="sk-... or your provider API key"
                  value={authSecret}
                  onChange={(e) => setAuthSecret(e.target.value)}
                />
                {requiresAuthSecret ? (
                  <p className="text-xs text-muted-foreground">Required for this auth choice.</p>
                ) : (
                  <p className="text-xs text-muted-foreground">Optional for OAuth/interactive auth choices.</p>
                )}
              </div>

              <Separator className="opacity-40" />
              <p className="text-xs text-muted-foreground">Custom provider (optional, docs: /start/onboarding-overview)</p>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs font-medium" htmlFor="custom-provider-id">
                    Custom Provider ID
                  </label>
                  <Input
                    id="custom-provider-id"
                    placeholder="my-custom"
                    value={customProviderId}
                    onChange={(e) => setCustomProviderId(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium" htmlFor="custom-provider-base-url">
                    Custom Base URL
                  </label>
                  <Input
                    id="custom-provider-base-url"
                    placeholder="https://llm.example.com/v1"
                    value={customProviderBaseUrl}
                    onChange={(e) => setCustomProviderBaseUrl(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium" htmlFor="custom-provider-api">
                    Custom API Type
                  </label>
                  <select
                    id="custom-provider-api"
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={customProviderApi}
                    onChange={(e) =>
                      setCustomProviderApi(e.target.value as 'openai-completions' | 'openai-responses')
                    }
                  >
                    <option value="openai-completions">openai-completions</option>
                    <option value="openai-responses">openai-responses</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium" htmlFor="custom-provider-api-key-env">
                    Custom API Key ENV (optional)
                  </label>
                  <Input
                    id="custom-provider-api-key-env"
                    placeholder="CUSTOM_API_KEY"
                    value={customProviderApiKeyEnv}
                    onChange={(e) => setCustomProviderApiKeyEnv(e.target.value)}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-xs font-medium" htmlFor="custom-provider-model-id">
                    Custom Model ID (optional)
                  </label>
                  <Input
                    id="custom-provider-model-id"
                    placeholder="foo-large"
                    value={customProviderModelId}
                    onChange={(e) => setCustomProviderModelId(e.target.value)}
                  />
                </div>
              </div>

              <Separator className="opacity-40" />
              <p className="text-xs text-muted-foreground">Channel tokens (optional)</p>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs font-medium" htmlFor="telegram-token">
                    Telegram Bot Token
                  </label>
                  <Input
                    id="telegram-token"
                    type="password"
                    placeholder="123456:ABC-..."
                    value={telegramToken}
                    onChange={(e) => setTelegramToken(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium" htmlFor="discord-token">
                    Discord Bot Token
                  </label>
                  <Input
                    id="discord-token"
                    type="password"
                    placeholder="Bot token"
                    value={discordToken}
                    onChange={(e) => setDiscordToken(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium" htmlFor="slack-bot-token">
                    Slack Bot Token
                  </label>
                  <Input
                    id="slack-bot-token"
                    type="password"
                    placeholder="xoxb-..."
                    value={slackBotToken}
                    onChange={(e) => setSlackBotToken(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium" htmlFor="slack-app-token">
                    Slack App Token
                  </label>
                  <Input
                    id="slack-app-token"
                    type="password"
                    placeholder="xapp-..."
                    value={slackAppToken}
                    onChange={(e) => setSlackAppToken(e.target.value)}
                  />
                </div>
              </div>

              <Button onClick={() => void runOnboarding()} disabled={onboardingBlocked}>
                {onboarding ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Play className="mr-1 h-4 w-4" />}
                Run Setup
              </Button>

              {onboardLog ? (
                <pre className="max-h-80 overflow-auto rounded-md border bg-muted p-3 text-xs text-foreground">
                  {onboardLog}
                </pre>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============================================================= */}
        {/* CONFIG EDITOR TAB */}
        {/* ============================================================= */}
        <TabsContent value="config" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Config Editor</CardTitle>
              <CardDescription>
                Read and write the raw OpenClaw config file (JSON5). Saving creates a timestamped backup
                and restarts the gateway.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void loadConfig()}
                  disabled={configLoading}
                >
                  {configLoading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}
                  Load config
                </Button>
                <span className="text-xs text-muted-foreground">
                  {configPath ? `File: ${configPath}` : ''}
                  {configPath && !configExists ? ' (does not exist yet)' : ''}
                </span>
              </div>
              <Textarea
                className="min-h-[300px] font-mono text-xs"
                value={configContent}
                onChange={(e) => setConfigContent(e.target.value)}
                placeholder="Load config first, or paste raw JSON5 here."
              />
              <Button onClick={() => void saveConfig()} disabled={configSaving || !configContent.trim()}>
                {configSaving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                Save config &amp; restart gateway
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============================================================= */}
        {/* CONSOLE TAB */}
        {/* ============================================================= */}
        <TabsContent value="console" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>
                <Terminal className="mr-2 inline h-5 w-5" />
                OpenClaw Console
              </CardTitle>
              <CardDescription>Run allowlisted OpenClaw CLI and gateway commands.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid gap-2 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium" htmlFor="console-cmd">
                    Command
                  </label>
                  <select
                    id="console-cmd"
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={consoleCmd}
                    onChange={(e) => setConsoleCmd(e.target.value)}
                  >
                    <optgroup label="Gateway lifecycle">
                      <option value="gateway.restart">gateway.restart</option>
                      <option value="gateway.stop">gateway.stop</option>
                      <option value="gateway.start">gateway.start</option>
                    </optgroup>
                    <optgroup label="OpenClaw CLI">
                      <option value="openclaw.version">openclaw.version</option>
                      <option value="openclaw.status">openclaw.status</option>
                      <option value="openclaw.health">openclaw.health</option>
                      <option value="openclaw.doctor">openclaw.doctor</option>
                      <option value="openclaw.logs.tail">openclaw.logs.tail</option>
                      <option value="openclaw.config.get">openclaw.config.get</option>
                    </optgroup>
                    <optgroup label="Devices">
                      <option value="openclaw.devices.list">openclaw.devices.list</option>
                      <option value="openclaw.devices.approve">openclaw.devices.approve</option>
                    </optgroup>
                    <optgroup label="Plugins">
                      <option value="openclaw.plugins.list">openclaw.plugins.list</option>
                      <option value="openclaw.plugins.enable">openclaw.plugins.enable</option>
                    </optgroup>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium" htmlFor="console-arg">
                    Argument (optional)
                  </label>
                  <Input
                    id="console-arg"
                    placeholder="e.g. 200, gateway.auth.mode, telegram"
                    value={consoleArg}
                    onChange={(e) => setConsoleArg(e.target.value)}
                  />
                </div>
              </div>

              <Button onClick={() => void runConsoleCommand()} disabled={consoleRunning || loading}>
                {consoleRunning ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Play className="mr-1 h-4 w-4" />}
                Run command
              </Button>

              <pre className="max-h-64 overflow-auto rounded-md border bg-muted p-3 text-xs text-foreground">
                {consoleOutput || 'No command run yet.'}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============================================================= */}
        {/* GATEWAY TAB */}
        {/* ============================================================= */}
        <TabsContent value="gateway" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Gateway Controls</CardTitle>
              <CardDescription>Start, stop, or restart the OpenClaw gateway process.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="grid gap-2 md:grid-cols-3">
                <div className="flex items-center justify-between rounded-md border p-3">
                  <span className="font-medium">Configured</span>
                  <Badge variant={isConfigured ? 'secondary' : 'destructive'}>
                    {isConfigured ? 'yes' : 'no'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between rounded-md border p-3">
                  <span className="font-medium">Gateway target</span>
                  <span className="text-xs">{settings?.gatewayTarget ?? '—'}</span>
                </div>
                <div className="flex items-center justify-between rounded-md border p-3">
                  <span className="font-medium">Setup password</span>
                  <Badge variant={settings?.setupPasswordConfigured ? 'secondary' : 'destructive'}>
                    {settings?.setupPasswordConfigured ? 'set' : 'missing'}
                  </Badge>
                </div>
              </div>

              <Separator />

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => void gatewayAction('start')}
                  disabled={gatewayBusy}
                  variant="outline"
                >
                  {gatewayBusy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Play className="mr-1 h-4 w-4" />}
                  Start
                </Button>
                <Button
                  onClick={() => void gatewayAction('stop')}
                  disabled={gatewayBusy}
                  variant="outline"
                >
                  <Square className="mr-1 h-4 w-4" />
                  Stop
                </Button>
                <Button onClick={() => void gatewayAction('restart')} disabled={gatewayBusy}>
                  {gatewayBusy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-1 h-4 w-4" />}
                  Restart
                </Button>
              </div>

              {!settings?.links?.gateway ? (
                <p className="text-xs text-muted-foreground">
                  Set <code>CORE_PUBLIC_URL</code> on the web service to expose direct gateway links.
                </p>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============================================================= */}
        {/* DEVICES TAB */}
        {/* ============================================================= */}
        <TabsContent value="devices" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Device Management</CardTitle>
              <CardDescription>
                List pending device pairing requests and approve them.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Button variant="outline" size="sm" onClick={() => void loadDevices()} disabled={devicesLoading}>
                {devicesLoading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}
                Refresh devices
              </Button>

              {pendingDevices.length > 0 ? (
                <div className="space-y-2">
                  {pendingDevices.map((id) => (
                    <div key={id} className="flex items-center gap-2 rounded-md border p-2">
                      <code className="flex-1 text-xs">{id}</code>
                      <Button size="sm" onClick={() => void approveDevice(id)}>
                        Approve
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {devicesOutput ? devicesOutput : 'Click "Refresh devices" to check for pending requests.'}
                </p>
              )}

              {devicesOutput && pendingDevices.length > 0 ? (
                <pre className="max-h-40 overflow-auto rounded-md border bg-muted p-3 text-xs text-foreground">
                  {devicesOutput}
                </pre>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============================================================= */}
        {/* CHANNELS TAB */}
        {/* ============================================================= */}
        <TabsContent value="channels" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Channel Status</CardTitle>
                <CardDescription>Current channel configuration from OpenClaw config.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <div className="flex items-center justify-between rounded-md border p-2">
                  <span>Telegram</span>
                  <Badge variant={settings?.channels.telegram ? 'secondary' : 'destructive'}>
                    {settings?.channels.telegram ? 'configured' : 'not configured'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between rounded-md border p-2">
                  <span>Discord</span>
                  <Badge variant={settings?.channels.discord ? 'secondary' : 'destructive'}>
                    {settings?.channels.discord ? 'configured' : 'not configured'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between rounded-md border p-2">
                  <span>Slack</span>
                  <Badge variant={settings?.channels.slack ? 'secondary' : 'destructive'}>
                    {settings?.channels.slack ? 'configured' : 'not configured'}
                  </Badge>
                </div>
                <Button variant="outline" size="sm" onClick={() => void loadSettings()}>
                  <RefreshCw className="mr-1 h-3 w-3" /> Refresh
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Approve Pairing</CardTitle>
                <CardDescription>
                  Approve a channel pairing request (Telegram or Discord DM pairing).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium" htmlFor="pairing-channel">
                      Channel
                    </label>
                    <select
                      id="pairing-channel"
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                      value={pairingChannel}
                      onChange={(e) => setPairingChannel(e.target.value)}
                    >
                      <option value="telegram">telegram</option>
                      <option value="discord">discord</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium" htmlFor="pairing-code">
                      Pairing Code
                    </label>
                    <Input
                      id="pairing-code"
                      placeholder="e.g. 3EY4PUYS"
                      value={pairingCode}
                      onChange={(e) => setPairingCode(e.target.value)}
                    />
                  </div>
                </div>
                <Button onClick={() => void approvePairing()} disabled={pairingBusy}>
                  {pairingBusy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                  Approve pairing
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ============================================================= */}
        {/* DIAGNOSTICS TAB */}
        {/* ============================================================= */}
        <TabsContent value="diagnostics" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Debug Info</CardTitle>
                <CardDescription>Full diagnostic dump from the core wrapper.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <Button variant="outline" size="sm" onClick={() => void loadDebug()} disabled={debugLoading}>
                  {debugLoading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}
                  Load debug info
                </Button>
                {debugData ? (
                  <pre className="max-h-80 overflow-auto rounded-md border bg-muted p-3 text-xs text-foreground">
                    {JSON.stringify(debugData, null, 2)}
                  </pre>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Click &quot;Load debug info&quot; to fetch diagnostics.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  Danger Zone
                </CardTitle>
                <CardDescription>
                  Reset setup deletes the config file and stops the gateway. You will need to re-run
                  onboarding afterwards.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <Button variant="destructive" onClick={() => void resetSetup()} disabled={resetting}>
                  {resetting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                  Reset Setup
                </Button>
                <p className="text-xs text-muted-foreground">
                  This stops the gateway and deletes config file(s) so onboarding can run again.
                  Credentials, sessions, and workspace data are preserved.
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Audit Log</CardTitle>
              <CardDescription>Recent operational action evidence.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <pre className="max-h-40 overflow-auto rounded-md border bg-muted p-3 text-xs text-foreground">
                {JSON.stringify(status?.lastReindexRun?.details ?? {}, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
