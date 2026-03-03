'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';

const steps = ['Display name', 'Notification channel', 'Learning goal', 'Guardrails'];

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [displayName, setDisplayName] = useState('');
  const [channel, setChannel] = useState('');
  const [goal, setGoal] = useState('part-1-foundations/ch-1/01-gamma-basics');
  const [guardrails, setGuardrails] = useState('');

  const pct = useMemo(() => ((step + 1) / steps.length) * 100, [step]);
  const isFinal = step === steps.length - 1;

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
            <Input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="What should we call you?"
            />
          ) : null}

          {step === 1 ? (
            <Input
              value={channel}
              onChange={(event) => setChannel(event.target.value)}
              placeholder="Notification channel (placeholder)"
            />
          ) : null}

          {step === 2 ? (
            <Input value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="Where would you like to start?" />
          ) : null}

          {step === 3 ? (
            <Textarea
              value={guardrails}
              onChange={(event) => setGuardrails(event.target.value)}
              placeholder="Set your learning guardrails (placeholder)"
            />
          ) : null}

          <div className="flex justify-between">
            <Button variant="outline" disabled={step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))}>
              Back
            </Button>
            {isFinal ? (
              <Button asChild>
                <Link href="/">Open Library</Link>
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
