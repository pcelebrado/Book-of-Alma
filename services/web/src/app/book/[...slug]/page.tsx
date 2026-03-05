import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';

import { HighlightToolbar } from '@/components/highlight-toolbar';
import { SectionBlocks } from '@/components/section-blocks';
import { getBookSectionsCollection } from '@/lib/db/collections';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';

interface SectionPageProps {
  params: { slug: string[] };
}

interface SectionPayload {
  section?: {
    slug: string;
    title: string;
    part?: { slug: string; title: string };
    chapter?: { slug: string; title: string };
  };
  frontmatter?: {
    summary?: string[];
    checklist?: string[];
    mistakes?: string[];
    drill?: { prompt?: string; answerKey?: string };
  };
  body?: {
    content?: string;
  };
  headings?: Array<{ id: string; text: string }>;
}

async function getSection(slug: string): Promise<SectionPayload | null> {
  try {
    const sections = await getBookSectionsCollection();
    const section =
      (await sections.findOne({ slug, status: 'published' })) ??
      (await sections.findOne({ slug }));

    if (!section) {
      return null;
    }

    return {
      section: {
        slug: section.slug,
        title: section.section.title,
        part: section.part,
        chapter: section.chapter,
      },
      frontmatter: section.frontmatter ?? {
        summary: [],
        checklist: [],
        mistakes: [],
        drill: {},
      },
      body: {
        content: section.bodyMarkdown,
      },
      headings: section.headings ?? [],
    };
  } catch {
    return null;
  }
}

export default async function ReaderPage({ params }: SectionPageProps) {
  const sectionSlug = params.slug?.join('/') ?? '';
  const payload = await getSection(sectionSlug);

  if (!payload?.section) {
    return (
      <div className="mx-auto max-w-3xl py-10">
        <h1 className="text-2xl font-semibold">Section failed to load.</h1>
        <p className="mt-2 text-sm text-muted-foreground">Retry or return to Library.</p>
        <Button asChild className="mt-4">
          <Link href="/">Back to Library</Link>
        </Button>
      </div>
    );
  }

  return (
    <article className="relative mx-auto max-w-[760px] space-y-6 pb-10">
      <HighlightToolbar sectionSlug={payload.section.slug} />

      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Library</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{payload.section.part?.title ?? 'Part'}</BreadcrumbPage>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{payload.section.chapter?.title ?? 'Chapter'}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header>
        <p className="text-xs text-muted-foreground">{payload.section.slug}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tightish">{payload.section.title}</h1>
      </header>

      <SectionBlocks frontmatter={payload.frontmatter} />

      <div className="rounded-lg border p-4">
        <h2 className="mb-2 text-sm font-semibold">On-page anchors</h2>
        {payload.headings && payload.headings.length > 0 ? (
          <ul className="space-y-1 text-sm text-muted-foreground">
            {payload.headings.map((heading) => (
              <li key={heading.id}>
                <a href={`#${heading.id}`} className="hover:text-foreground hover:underline">
                  {heading.text}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No anchors yet.</p>
        )}
      </div>

      <div className="prose prose-invert max-w-none leading-relaxed2">
        <p>{payload.body?.content ?? 'No body content is available for this section.'}</p>
      </div>

      <div className="flex items-center justify-between border-t pt-4">
        <Button asChild variant="outline">
          <Link href="/book">
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Link>
        </Button>
        <Button asChild>
          <Link href="/book">
            Next
            <ChevronRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </article>
  );
}
