import Link from 'next/link';

import { NotebookPen } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function JournalPlaceholderPage() {
  return (
    <div className="mx-auto max-w-3xl py-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <NotebookPen className="h-5 w-5" />
            Journal
          </CardTitle>
          <CardDescription>Coming soon. Your journal entries will appear here.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/notes">View Notes</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
