import { redirect } from 'next/navigation';
import Link from 'next/link';

import { getUsersCollection } from '@/lib/db/collections';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

import { OnboardingForm } from './setup-form';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  try {
    const users = await getUsersCollection();
    const userCount = await users.countDocuments();

    if (userCount > 0) {
      redirect('/login?onboarding=closed');
    }

    return <OnboardingForm />;
  } catch {
    return (
      <div className="mx-auto flex min-h-screen max-w-xl items-center px-4 py-10">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Onboarding is temporarily unavailable</CardTitle>
            <CardDescription>
              We could not verify setup state right now. Try again in a moment.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Button asChild>
                <Link href="/onboarding">Retry</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/login">Go to sign in</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
}
