import Link from 'next/link';

import { LayoutDashboard } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-3xl py-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <LayoutDashboard className="h-5 w-5" />
            Dashboard
          </CardTitle>
          <CardDescription>Quick links to active study workflows.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button asChild className="w-full justify-start">
            <Link href="/">Open Library</Link>
          </Button>
          <Button asChild variant="outline" className="w-full justify-start">
            <Link href="/book">Resume Reader</Link>
          </Button>
          <Button asChild variant="outline" className="w-full justify-start">
            <Link href="/notes">Review Notes</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
