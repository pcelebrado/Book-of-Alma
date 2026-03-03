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

export default function AdminPage() {
  const [status, setStatus] = useState<AdminStatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [reindexing, setReindexing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    void loadStatus();
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
