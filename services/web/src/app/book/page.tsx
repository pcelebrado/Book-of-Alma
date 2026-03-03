import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function ReaderLandingPage() {
  return (
    <div className="mx-auto max-w-3xl py-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Reader</CardTitle>
          <CardDescription>Select a section from the Table of Contents to begin reading.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            The Reader includes structured section blocks, anchor links, and the assistant rail.
          </p>
          <Button asChild>
            <Link href="/">Open Library</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
