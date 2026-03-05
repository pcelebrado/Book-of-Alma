'use client';

import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export default function LoginPage() {
  const router = useRouter();
  const [showOnboardingClosed, setShowOnboardingClosed] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    setShowOnboardingClosed(params.get('onboarding') === 'closed');
  }, []);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError(result.error);
        return;
      }

      router.push('/');
      router.refresh();
    } catch {
      setError('Login failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Sign in</CardTitle>
          <CardDescription>Book-first learning access for OpenClaw.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {showOnboardingClosed ? (
            <Alert>
              <AlertTitle>Onboarding locked</AlertTitle>
              <AlertDescription>
                Admin setup is complete. Sign in with an existing account.
              </AlertDescription>
            </Alert>
          ) : null}

          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">
                Email
              </label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">
                Password
              </label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>

            {error ? (
              <Alert>
                <AlertTitle>Login failed.</AlertTitle>
                <AlertDescription>
                  {error.includes('Too many')
                    ? 'Too many attempts. Try again in 15 minutes.'
                    : 'Login failed. Check your email and password.'}
                </AlertDescription>
              </Alert>
            ) : null}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Signing in...' : 'Continue'}
            </Button>
          </form>

          <p className="text-xs text-muted-foreground">
            New here? <Link href="/onboarding" className="underline">Start onboarding</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
