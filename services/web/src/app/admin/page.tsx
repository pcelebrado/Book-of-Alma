'use client';

import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

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
}

export default function AdminPage() {
  const [status, setStatus] = useState<AdminStatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [reindexing, setReindexing] = useState(false);
  const [restartingGateway, setRestartingGateway] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [openClawSettings, setOpenClawSettings] = useState<OpenClawSettingsPayload | null>(null);
  const [consoleRunning, setConsoleRunning] = useState(false);
  const [consoleCommand, setConsoleCommand] = useState('openclaw.status');
  const [consoleArg, setConsoleArg] = useState('');
  const [consoleOutput, setConsoleOutput] = useState('');

  const loadStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/status', { cache: 'no-store' });
      const payload = (await response.json()) as AdminStatusPayload | { error?: { message?: string } };
      if (!response.ok) {
        const message = 'error' in payload ? payload.error?.message : 'Unable to load admin status';
        throw new Error(message ?? 'Unable to load admin status');
      }

      setStatus(payload as AdminStatusPayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load admin status');
    } finally {
      setLoading(false);
    }
  };

  const loadOpenClawSettings = async () => {
    setSettingsError(null);
    try {
      const response = await fetch('/api/admin/openclaw/settings', { cache: 'no-store' });
      const payload = (await response.json()) as OpenClawSettingsPayload | { error?: { message?: string } };
      if (!response.ok) {
        const message = 'error' in payload ? payload.error?.message : 'Unable to load OpenClaw settings';
        throw new Error(message ?? 'Unable to load OpenClaw settings');
      }

      setOpenClawSettings(payload as OpenClawSettingsPayload);
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : 'Unable to load OpenClaw settings');
    }
  };

  useEffect(() => {
    void loadStatus();
    void loadOpenClawSettings();
  }, []);

  const triggerReindex = async () => {
    setReindexing(true);
    setProgress(25);
    try {
      const response = await fetch('/api/admin/book/reindex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: true }),
      });
      const payload = (await response.json()) as { started?: boolean; error?: { message?: string } };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? 'Reindex failed. Retry.');
      }
      setProgress(100);
      toast.success('Reindex started.');
      await loadStatus();
    } catch (err) {
      setProgress(0);
      toast.error(err instanceof Error ? err.message : 'Reindex failed. Retry.');
    } finally {
      setReindexing(false);
      setTimeout(() => setProgress(0), 1200);
    }
  };

  const restartGateway = async () => {
    setRestartingGateway(true);
    try {
      const response = await fetch('/api/admin/openclaw/gateway/restart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const payload = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? 'Gateway restart failed');
      }

      toast.success('OpenClaw gateway restart triggered.');
      await loadStatus();
      await loadOpenClawSettings();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gateway restart failed');
    } finally {
      setRestartingGateway(false);
    }
  };

  const runConsoleCommand = async () => {
    setConsoleRunning(true);
    try {
      const response = await fetch('/api/admin/openclaw/console/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cmd: consoleCommand,
          arg: consoleArg,
        }),
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        output?: string;
        error?: { message?: string };
      };

      if (!response.ok) {
        throw new Error(payload.error?.message ?? 'Console command failed');
      }

      setConsoleOutput(payload.output ?? 'Command completed with no output.');
      toast.success('OpenClaw console command executed.');
      await loadOpenClawSettings();
      await loadStatus();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Console command failed';
      setConsoleOutput(message);
      toast.error(message);
    } finally {
      setConsoleRunning(false);
    }
  };

  return (
    <div className="space-y-6 pb-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tightish">Admin</h1>
        <p className="mt-2 text-sm text-muted-foreground">System health, reindex controls, and audit visibility.</p>
      </div>

      {error ? (
        <Alert>
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

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Book Reindex</CardTitle>
            <CardDescription>No silent failure: state + last run + retry.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <div className="flex items-center justify-between">
              <span>Status</span>
              <Badge variant={reindexing ? 'default' : 'secondary'}>{reindexing ? 'running' : 'idle'}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span>Last run</span>
              <span>{status?.lastReindexRun?.at ? new Date(status.lastReindexRun.at).toLocaleString() : '—'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Last error</span>
              <span>{status?.core === 'unreachable' ? 'Core service is asleep/unreachable.' : 'none'}</span>
            </div>
            <Progress value={progress} />
            <Button onClick={() => void triggerReindex()} disabled={reindexing || loading}>
              {reindexing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Reindex book
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>System Status</CardTitle>
            <CardDescription>Health from /api/admin/status.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <div className="flex items-center justify-between">
              <span>Web</span>
              <Badge variant="secondary">ok</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span>Core</span>
              <Badge variant={status?.core === 'ok' ? 'secondary' : 'destructive'}>{status?.core ?? 'unknown'}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span>MongoDB</span>
              <Badge variant={status?.mongo === 'connected' ? 'secondary' : 'destructive'}>{status?.mongo ?? 'unknown'}</Badge>
            </div>
            <div className="rounded-md border p-3 text-xs">
              <p>Last core check: {status?.lastCoreHealthCheck ?? '—'}</p>
              <p>Last core unavailable: {status?.lastCoreUnavailableAt ?? '—'}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>OpenClaw Settings</CardTitle>
          <CardDescription>Gateway configuration and channel state from the core wrapper.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <div className="grid gap-2 md:grid-cols-2">
            <div className="flex items-center justify-between rounded-md border p-2">
              <span>Configured</span>
              <Badge variant={openClawSettings?.configured ? 'secondary' : 'destructive'}>
                {openClawSettings?.configured ? 'yes' : 'no'}
              </Badge>
            </div>
            <div className="flex items-center justify-between rounded-md border p-2">
              <span>Setup password</span>
              <Badge variant={openClawSettings?.setupPasswordConfigured ? 'secondary' : 'destructive'}>
                {openClawSettings?.setupPasswordConfigured ? 'set' : 'missing'}
              </Badge>
            </div>
            <div className="flex items-center justify-between rounded-md border p-2">
              <span>Gateway auth mode</span>
              <span>{openClawSettings?.settings.authMode ?? '—'}</span>
            </div>
            <div className="flex items-center justify-between rounded-md border p-2">
              <span>Gateway bind:port</span>
              <span>
                {(openClawSettings?.settings.bind ?? '—')}
                :
                {(openClawSettings?.settings.port ?? '—')}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-md border p-2">
              <span>HTTP /v1/chat/completions</span>
              <Badge variant={openClawSettings?.settings.chatCompletionsEnabled === 'true' ? 'secondary' : 'destructive'}>
                {openClawSettings?.settings.chatCompletionsEnabled ?? 'unknown'}
              </Badge>
            </div>
            <div className="flex items-center justify-between rounded-md border p-2">
              <span>HTTP /v1/responses</span>
              <Badge variant={openClawSettings?.settings.responsesEnabled === 'true' ? 'secondary' : 'destructive'}>
                {openClawSettings?.settings.responsesEnabled ?? 'unknown'}
              </Badge>
            </div>
            <div className="flex items-center justify-between rounded-md border p-2">
              <span>Gateway auth token</span>
              <Badge variant={openClawSettings?.secrets.authTokenConfigured ? 'secondary' : 'destructive'}>
                {openClawSettings?.secrets.authTokenConfigured ? 'configured' : 'missing'}
              </Badge>
            </div>
            <div className="flex items-center justify-between rounded-md border p-2">
              <span>Gateway remote token</span>
              <Badge variant={openClawSettings?.secrets.remoteTokenConfigured ? 'secondary' : 'destructive'}>
                {openClawSettings?.secrets.remoteTokenConfigured ? 'configured' : 'missing'}
              </Badge>
            </div>
          </div>

          <div className="rounded-md border p-3 text-xs">
            <p>Gateway target: {openClawSettings?.gatewayTarget ?? '—'}</p>
            <p>Telegram channel: {openClawSettings?.channels.telegram ?? 'not configured'}</p>
            <p>Discord channel: {openClawSettings?.channels.discord ?? 'not configured'}</p>
            <p>Slack channel: {openClawSettings?.channels.slack ?? 'not configured'}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void loadOpenClawSettings()} disabled={loading || restartingGateway}>
              Refresh OpenClaw settings
            </Button>
            <Button onClick={() => void restartGateway()} disabled={loading || restartingGateway}>
              {restartingGateway ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Restart OpenClaw gateway
            </Button>
            {openClawSettings?.links?.gateway ? (
              <Button asChild variant="secondary">
                <a href={openClawSettings.links.gateway} target="_blank" rel="noreferrer">Open OpenClaw gateway</a>
              </Button>
            ) : null}
            {openClawSettings?.links?.setup ? (
              <Button asChild variant="outline">
                <a href={openClawSettings.links.setup} target="_blank" rel="noreferrer">Open OpenClaw setup</a>
              </Button>
            ) : null}
          </div>

          {!openClawSettings?.links?.gateway ? (
            <p className="text-xs">
              Gateway link unavailable. Set <code>CORE_PUBLIC_URL</code> on web service to expose direct OpenClaw links.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>OpenClaw Console</CardTitle>
          <CardDescription>Run wrapper-allowlisted OpenClaw diagnostics from Admin.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <div className="grid gap-2 md:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="openclaw-cmd" className="text-xs">Command</label>
              <select
                id="openclaw-cmd"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={consoleCommand}
                onChange={(event) => setConsoleCommand(event.target.value)}
              >
                <option value="openclaw.status">openclaw.status</option>
                <option value="openclaw.health">openclaw.health</option>
                <option value="openclaw.doctor">openclaw.doctor</option>
                <option value="openclaw.logs.tail">openclaw.logs.tail</option>
                <option value="openclaw.config.get">openclaw.config.get</option>
                <option value="gateway.restart">gateway.restart</option>
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="openclaw-arg" className="text-xs">Argument (optional)</label>
              <input
                id="openclaw-arg"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                placeholder="e.g. 200 or gateway.auth.mode"
                value={consoleArg}
                onChange={(event) => setConsoleArg(event.target.value)}
              />
            </div>
          </div>

          <Button onClick={() => void runConsoleCommand()} disabled={consoleRunning || loading}>
            {consoleRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Run OpenClaw console command
          </Button>

          <pre className="max-h-64 overflow-auto rounded-md border bg-muted p-3 text-xs text-foreground">
            {consoleOutput || 'No command run yet.'}
          </pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Audit Log (recent)</CardTitle>
          <CardDescription>Most recent operational action evidence.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>
            Last reindex details: {JSON.stringify(status?.lastReindexRun?.details ?? {}, null, 0)}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
