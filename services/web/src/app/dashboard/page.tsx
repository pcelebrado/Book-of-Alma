import Link from 'next/link';

import { LayoutDashboard } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function DashboardPlaceholderPage() {
  return (
    <div className="mx-auto max-w-3xl py-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <LayoutDashboard className="h-5 w-5" />
            Dashboard
          </CardTitle>
          <CardDescription>Coming soon. Key metrics will appear here.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/">Go to Library</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
