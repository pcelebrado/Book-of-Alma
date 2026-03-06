'use client';

import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export function OnboardingForm() {
  const router = useRouter();
  const [checkingState, setCheckingState] = useState(true);
  const [stateErrorCode, setStateErrorCode] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<{
    sqlite?: string;
    core?: string;
    service_auth?: string;
  } | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkOnboardingState = async () => {
      setCheckingState(true);
      setStateErrorCode(null);

      try {
        const response = await fetch('/api/auth/register', {
          method: 'GET',
          cache: 'no-store',
        });

        if (response.ok) {
          const payload = (await response.json()) as {
            onboardingOpen?: boolean;
          };

          if (payload.onboardingOpen === false) {
            router.push('/login?onboarding=closed');
            router.refresh();
            return;
          }

          setCheckingState(false);
          return;
        }

        const errorPayload = (await response.json()) as {
          error?: { code?: string };
        };
        setStateErrorCode(errorPayload.error?.code ?? `http_${response.status}`);

        const healthResponse = await fetch('/api/health', {
          method: 'GET',
          cache: 'no-store',
        });
        if (healthResponse.ok) {
          const healthPayload = (await healthResponse.json()) as {
            sqlite?: string;
            core?: string;
            service_auth?: string;
          };
          setDiagnostics(healthPayload);
        }
      } catch {
        setStateErrorCode('state_check_failed');
      } finally {
        setCheckingState(false);
      }
    };

    void checkOnboardingState();
  }, [router]);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          password,
        }),
      });

      const payload = (await response.json()) as {
        error?: { code?: string; message?: string };
      };

      if (!response.ok) {
        if (payload.error?.code === 'onboarding_closed') {
          router.push('/login?onboarding=closed');
          router.refresh();
          return;
        }

        setError(payload.error?.message ?? 'Unable to create admin account.');
        return;
      }

      const signInResult = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (signInResult?.error) {
        setError('Account created, but sign-in failed. Please sign in manually.');
        router.push('/login');
        router.refresh();
        return;
      }

      router.push('/');
      router.refresh();
    } catch {
      setError('Unable to create admin account.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-xl items-center px-4 py-10">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Create Admin Account</CardTitle>
          <CardDescription>
            This setup is available only once. After the first admin is created,
            onboarding is locked.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {checkingState ? (
            <p className="text-sm text-muted-foreground">Checking onboarding state...</p>
          ) : null}

          {!checkingState && stateErrorCode ? (
            <div className="space-y-3 rounded-md border p-3 text-sm">
              <p className="font-medium text-red-500">Onboarding state check failed</p>
              <p>Code: <span className="font-mono">{stateErrorCode}</span></p>
              {diagnostics ? (
                <div className="space-y-1 text-muted-foreground">
                  <p>sqlite: <span className="font-mono">{diagnostics.sqlite ?? 'unknown'}</span></p>
                  <p>core: <span className="font-mono">{diagnostics.core ?? 'unknown'}</span></p>
                  <p>service_auth: <span className="font-mono">{diagnostics.service_auth ?? 'unknown'}</span></p>
                </div>
              ) : null}
              <Button type="button" variant="outline" onClick={() => window.location.reload()}>
                Retry check
              </Button>
            </div>
          ) : null}

          {!checkingState && !stateErrorCode ? (
          <form className="space-y-4" onSubmit={onSubmit}>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Full name"
              required
            />
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Email"
              required
            />
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password (min 8 characters)"
              minLength={8}
              required
            />
            <Input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Confirm password"
              minLength={8}
              required
            />

            {error ? <p className="text-sm text-red-500">{error}</p> : null}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Creating admin...' : 'Create admin account'}
            </Button>
          </form>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
