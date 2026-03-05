'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';

const steps = ['Account', 'Notifications', 'Learning goal', 'Guardrails'];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [channelType, setChannelType] = useState<'none' | 'telegram' | 'discord' | 'slack'>('none');
  const [channelValue, setChannelValue] = useState('');
  const [goal, setGoal] = useState('part-1-foundations/ch-1/01-gamma-basics');
  const [maxTradesPerDay, setMaxTradesPerDay] = useState('3');
  const [maxLossPerDay, setMaxLossPerDay] = useState('500');
  const [cooldownMinutes, setCooldownMinutes] = useState('60');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pct = useMemo(() => ((step + 1) / steps.length) * 100, [step]);
  const isFinal = step === steps.length - 1;

  const onFinish = async () => {
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: displayName,
          email,
          password,
          learningGoal: goal,
          notificationChannel: {
            type: channelType,
            value: channelValue,
          },
          riskGuardrails: {
            maxTradesPerDay: Number(maxTradesPerDay),
            maxLossPerDay: Number(maxLossPerDay),
            cooldownMinutes: Number(cooldownMinutes),
          },
        }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: { message?: string } };
        setError(payload.error?.message ?? 'Unable to create account.');
        return;
      }

      router.push('/');
      router.refresh();
    } catch {
      setError('Unable to create account.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl items-center px-4 py-10">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Onboarding</CardTitle>
          <CardDescription>
            Step {step + 1} of {steps.length}: {steps[step]}
          </CardDescription>
          <Progress value={pct} />
        </CardHeader>
        <CardContent className="space-y-4">
          {step === 0 ? (
            <div className="space-y-3">
              <Input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Your name"
              />
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Email"
              />
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Password (min 8 characters)"
              />
            </div>
          ) : null}

          {step === 1 ? (
            <div className="space-y-3">
              <label className="text-sm text-muted-foreground">Notification channel (optional)</label>
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={channelType}
                onChange={(event) => setChannelType(event.target.value as typeof channelType)}
              >
                <option value="none">None for now</option>
                <option value="telegram">Telegram</option>
                <option value="discord">Discord</option>
                <option value="slack">Slack</option>
              </select>
              <Input
                value={channelValue}
                onChange={(event) => setChannelValue(event.target.value)}
                placeholder={
                  channelType === 'telegram'
                    ? 'Telegram user/chat id (optional now)'
                    : channelType === 'discord'
                      ? 'Discord user/channel id'
                      : channelType === 'slack'
                        ? 'Slack channel id'
                        : 'Leave blank if not configuring now'
                }
                disabled={channelType === 'none'}
              />
            </div>
          ) : null}

          {step === 2 ? (
            <Input value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="Where would you like to start?" />
          ) : null}

          {step === 3 ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Learning guardrails are real. These become your default risk limits.
              </p>
              <Input
                type="number"
                min={1}
                value={maxTradesPerDay}
                onChange={(event) => setMaxTradesPerDay(event.target.value)}
                placeholder="Max trades per day"
              />
              <Input
                type="number"
                min={1}
                value={maxLossPerDay}
                onChange={(event) => setMaxLossPerDay(event.target.value)}
                placeholder="Max daily loss"
              />
              <Input
                type="number"
                min={1}
                value={cooldownMinutes}
                onChange={(event) => setCooldownMinutes(event.target.value)}
                placeholder="Cooldown minutes"
              />
            </div>
          ) : null}

          {error ? <p className="text-sm text-red-500">{error}</p> : null}

          <div className="flex justify-between">
            <Button variant="outline" disabled={step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))}>
              Back
            </Button>
            {isFinal ? (
              <Button onClick={onFinish} disabled={submitting}>
                {submitting ? 'Creating account...' : 'Create account & open library'}
              </Button>
            ) : (
              <Button onClick={() => setStep((value) => Math.min(steps.length - 1, value + 1))}>Next</Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
