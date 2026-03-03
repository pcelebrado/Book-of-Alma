import Link from 'next/link';

import { Siren } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function AlertsPlaceholderPage() {
  return (
    <div className="mx-auto max-w-3xl py-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <Siren className="h-5 w-5" />
            Alerts
          </CardTitle>
          <CardDescription>Coming soon. Alert automation is not yet active.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/admin">Configure from Admin</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
