'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';

interface TocSection {
  slug: string;
  title: string;
}

interface TocChapter {
  slug: string;
  title: string;
  sections?: TocSection[];
}

interface TocPart {
  slug: string;
  title: string;
  chapters?: TocChapter[];
}

interface TocResponse {
  tocTree?: {
    parts?: TocPart[];
  };
}

export function TOCTree({ className }: { className?: string }) {
  const [parts, setParts] = useState<TocPart[]>([]);
  const [progressBySection, setProgressBySection] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadToc = async () => {
      try {
        setLoading(true);
        setError(null);
        const [tocResponse, progressResponse] = await Promise.all([
          fetch('/api/book/toc', { cache: 'no-store' }),
          fetch('/api/progress/summary', { cache: 'no-store' }),
        ]);

        if (!tocResponse.ok) {
          throw new Error('TOC failed to load');
        }

        const payload = (await tocResponse.json()) as TocResponse;
        setParts(payload.tocTree?.parts ?? []);

        if (progressResponse.ok) {
          const progressPayload = (await progressResponse.json()) as {
            recent?: Array<{ sectionSlug: string; percent: number }>;
          };
          const nextProgress = (progressPayload.recent ?? []).reduce<Record<string, number>>(
            (acc, entry) => {
              acc[entry.sectionSlug] = entry.percent;
              return acc;
            },
            {},
          );
          setProgressBySection(nextProgress);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'TOC failed to load');
      } finally {
        setLoading(false);
      }
    };

    void loadToc();
  }, []);

  const defaultOpen = useMemo(
    () => parts.map((part) => `part-${part.slug}`),
    [parts],
  );

  if (loading) {
    return (
      <div className={className}>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Book</p>
        <div className="mt-4 space-y-3">
          <Skeleton className="h-5 w-4/5" />
          <Skeleton className="h-5 w-3/5" />
          <Skeleton className="h-5 w-2/3" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={className}>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Book</p>
        <div className="mt-4 rounded-lg border border-dashed border-destructive/40 p-3 text-sm">
          <p>TOC failed to load.</p>
          <p className="mt-2 text-xs text-muted-foreground">Retry the page to recover navigation.</p>
        </div>
      </div>
    );
  }

  if (parts.length === 0) {
    return (
      <div className={className}>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Book</p>
        <div className="mt-4 rounded-lg border border-dashed p-3 text-sm">
          <p>No sections published yet.</p>
          <p className="mt-2 text-xs text-muted-foreground">Import or publish content from the admin page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Book</p>
      <ScrollArea className="mt-3 h-[calc(100vh-150px)] pr-3">
        <Accordion type="multiple" defaultValue={defaultOpen} className="w-full">
          {parts.map((part) => (
            <AccordionItem key={part.slug} value={`part-${part.slug}`}>
              <AccordionTrigger className="text-sm font-medium">{part.title}</AccordionTrigger>
              <AccordionContent className="space-y-3">
                {(part.chapters ?? []).map((chapter) => (
                  <div key={chapter.slug} className="space-y-2 rounded-lg border p-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-muted-foreground">{chapter.title}</p>
                      <Badge variant="secondary">{chapter.sections?.length ?? 0}</Badge>
                    </div>
                    <Progress
                      value={(chapter.sections ?? []).length > 0
                        ? (chapter.sections ?? []).reduce((sum, section) => sum + (progressBySection[section.slug] ?? 0), 0)
                          / (chapter.sections ?? []).length
                        : 0}
                      className="h-1.5"
                    />
                    <div className="space-y-1">
                      {(chapter.sections ?? []).map((section) => (
                        <Link
                          key={section.slug}
                          href={`/book/${section.slug}`}
                          className="block rounded px-2 py-1 text-sm text-muted-foreground transition hover:bg-accent hover:text-accent-foreground"
                        >
                          {section.title}
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </ScrollArea>
    </div>
  );
}
