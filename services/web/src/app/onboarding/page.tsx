import { redirect } from 'next/navigation';

import { getUsersCollection } from '@/lib/db/collections';

import { OnboardingForm } from './setup-form';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const users = await getUsersCollection();
  const userCount = await users.countDocuments();

  if (userCount > 0) {
    redirect('/login?onboarding=closed');
  }

  return <OnboardingForm />;
}
