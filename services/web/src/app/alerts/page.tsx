import Link from 'next/link';

import { Siren } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function AlertsPage() {
  return (
    <div className="mx-auto max-w-3xl py-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <Siren className="h-5 w-5" />
            Alerts
          </CardTitle>
          <CardDescription>Alert controls are managed through admin health and reindex actions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button asChild className="w-full justify-start">
            <Link href="/admin">Open Admin status</Link>
          </Button>
          <Button asChild variant="outline" className="w-full justify-start">
            <Link href="/playbooks">Review playbook triggers</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
