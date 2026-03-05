'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';

interface NoteItem {
  _id: string;
  title?: string;
  body: string;
  sectionSlug: string;
  tags?: string[];
  updatedAt: string;
}

export default function NotesPage() {
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<NoteItem | null>(null);

  useEffect(() => {
    const loadNotes = async () => {
      const response = await fetch('/api/notes', { cache: 'no-store' });
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as { notes?: NoteItem[] };
      setNotes(payload.notes ?? []);
    };

    void loadNotes();
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) {
      return notes;
    }

    const lower = query.toLowerCase();
    return notes.filter((note) => {
      const haystack = `${note.title ?? ''} ${note.body} ${(note.tags ?? []).join(' ')}`.toLowerCase();
      return haystack.includes(lower);
    });
  }, [notes, query]);

  return (
    <div className="space-y-6 pb-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tightish">Notes</h1>
        <p className="mt-2 text-sm text-muted-foreground">Search, filter, and revisit your reading notes.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search notes"
          className="max-w-md"
        />
      </div>

      {filtered.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((note) => (
            <Card key={note._id} className="cursor-pointer transition hover:border-accent" onClick={() => setActive(note)}>
              <CardHeader>
                <CardTitle className="text-base">{note.title ?? 'Untitled note'}</CardTitle>
                <CardDescription className="truncate">{note.body}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-xs text-muted-foreground">
                <p>Updated: {new Date(note.updatedAt).toLocaleString()}</p>
                <div className="flex flex-wrap gap-1">
                  {(note.tags ?? []).map((tag) => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
                <Link href={`/book/${note.sectionSlug}`} className="inline-flex text-sm underline">
                  Open section context
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>No notes yet.</CardTitle>
            <CardDescription>Open the book and highlight text to create your first note.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/book">Open Reader</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <Sheet open={Boolean(active)} onOpenChange={(open) => (!open ? setActive(null) : null)}>
        <SheetContent side="right" className="w-[420px] sm:max-w-[420px]">
          <SheetHeader>
            <SheetTitle>{active?.title ?? 'Note details'}</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-4 text-sm">
            <p className="text-muted-foreground">{active?.body}</p>
            <div className="flex flex-wrap gap-2">
              {(active?.tags ?? []).map((tag) => (
                <Badge key={tag}>{tag}</Badge>
              ))}
            </div>
            {active?.sectionSlug ? (
              <Button asChild variant="outline">
                <Link href={`/book/${active.sectionSlug}`}>Jump to section</Link>
              </Button>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
