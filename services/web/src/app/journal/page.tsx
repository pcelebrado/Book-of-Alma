import Link from 'next/link';

import { NotebookPen } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function JournalPage() {
  return (
    <div className="mx-auto max-w-3xl py-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <NotebookPen className="h-5 w-5" />
            Journal
          </CardTitle>
          <CardDescription>Capture and review trade-learning notes from the reader.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button asChild className="w-full justify-start">
            <Link href="/notes">View all notes</Link>
          </Button>
          <Button asChild variant="outline" className="w-full justify-start">
            <Link href="/book">Open Reader and add note</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
