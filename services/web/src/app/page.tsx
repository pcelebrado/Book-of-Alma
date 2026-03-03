'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface PartItem {
  slug: string;
  title: string;
  chapters?: Array<{ slug: string; title: string; sections?: Array<{ slug: string; title: string }> }>;
}

interface NoteItem {
  _id: string;
  title?: string;
  body: string;
  sectionSlug: string;
  updatedAt: string;
}

export default function LibraryPage() {
  const [parts, setParts] = useState<PartItem[]>([]);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [continueItem, setContinueItem] = useState<{ sectionSlug: string; percent: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [tocRes, progressRes, notesRes] = await Promise.all([
          fetch('/api/book/toc', { cache: 'no-store' }),
          fetch('/api/progress/summary', { cache: 'no-store' }),
          fetch('/api/notes', { cache: 'no-store' }),
        ]);

        if (tocRes.ok) {
          const tocPayload = (await tocRes.json()) as { tocTree?: { parts?: PartItem[] } };
          setParts(tocPayload.tocTree?.parts ?? []);
        }

        if (progressRes.ok) {
          const progressPayload = (await progressRes.json()) as {
            continue?: { sectionSlug: string; percent: number };
          };
          setContinueItem(progressPayload.continue ?? null);
        }

        if (notesRes.ok) {
          const notesPayload = (await notesRes.json()) as { notes?: NoteItem[] };
          setNotes(notesPayload.notes ?? []);
        }
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  return (
    <div className="space-y-6 pb-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tightish">Library</h1>
        <p className="mt-2 text-sm text-muted-foreground">Your curriculum and playbooks.</p>
      </div>

      {continueItem ? (
        <Card>
          <CardHeader>
            <CardTitle>Continue reading</CardTitle>
            <CardDescription>{continueItem.sectionSlug}</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <Badge variant="secondary">{continueItem.percent}% complete</Badge>
            <Button asChild>
              <Link href={`/book/${continueItem.sectionSlug}`}>Resume</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Start here</CardTitle>
            <CardDescription>No progress yet. Begin with the first published section.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/book">Open Reader</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {loading
          ? Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-44" />)
          : parts.length > 0
            ? parts.map((part) => (
                <Card key={part.slug}>
                  <CardHeader>
                    <CardTitle>{part.title}</CardTitle>
                    <CardDescription>{part.chapters?.length ?? 0} chapter(s)</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-muted-foreground">
                    {(part.chapters ?? []).slice(0, 3).map((chapter) => (
                      <p key={chapter.slug}>{chapter.title}</p>
                    ))}
                    <Button asChild variant="outline" className="mt-2">
                      <Link href="/book">Open Part</Link>
                    </Button>
                  </CardContent>
                </Card>
              ))
            : (
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>No sections published yet.</CardTitle>
                  <CardDescription>Import or publish content from admin to populate the library.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild>
                    <Link href="/admin">Open Admin</Link>
                  </Button>
                </CardContent>
              </Card>
            )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Today&apos;s Focus</CardTitle>
            <CardDescription>Pick one section to keep momentum.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            {parts.length > 0 ? (
              <>
                <Link href="/book" className="block rounded border p-2 hover:bg-accent hover:text-accent-foreground">
                  Review the latest published section
                </Link>
                <Link href="/notes" className="block rounded border p-2 hover:bg-accent hover:text-accent-foreground">
                  Revisit your recent note context
                </Link>
              </>
            ) : (
              <p>No focus sections yet. Publish content to set today&apos;s focus.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Notes</CardTitle>
            <CardDescription>Latest captured insights.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            {notes.length > 0 ? (
              notes.slice(0, 3).map((note) => (
                <Link key={note._id} href={`/book/${note.sectionSlug}`} className="block rounded border p-2 hover:bg-accent hover:text-accent-foreground">
                  <p className="font-medium text-foreground">{note.title ?? 'Untitled note'}</p>
                  <p className="truncate">{note.body}</p>
                </Link>
              ))
            ) : (
              <>
                <p>No notes yet.</p>
                <Button asChild variant="outline">
                  <Link href="/book">Add a note while reading</Link>
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
