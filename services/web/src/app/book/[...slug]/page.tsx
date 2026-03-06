/**
 * Book section reader page (RSC).
 * DECISION_197: MongoDB → SQLite migration.
 */
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';

import { HighlightToolbar } from '@/components/highlight-toolbar';
import { SectionBlocks } from '@/components/section-blocks';
import { bookSections } from '@/lib/db/repositories';
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
  previousSlug?: string;
  nextSlug?: string;
}

function escapeHtml(raw: string): string {
  return raw
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderMarkdown(markdown: string): string {
  const lines = markdown.split('\n');
  const output: string[] = [];
  let listOpen = false;

  const closeListIfOpen = () => {
    if (listOpen) {
      output.push('</ul>');
      listOpen = false;
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      closeListIfOpen();
      continue;
    }

    if (trimmed.startsWith('- ')) {
      if (!listOpen) {
        output.push('<ul>');
        listOpen = true;
      }
      output.push(`<li>${escapeHtml(trimmed.slice(2))}</li>`);
      continue;
    }

    closeListIfOpen();

    if (trimmed.startsWith('### ')) {
      output.push(`<h3>${escapeHtml(trimmed.slice(4))}</h3>`);
      continue;
    }

    if (trimmed.startsWith('## ')) {
      output.push(`<h2>${escapeHtml(trimmed.slice(3))}</h2>`);
      continue;
    }

    if (trimmed.startsWith('# ')) {
      output.push(`<h1>${escapeHtml(trimmed.slice(2))}</h1>`);
      continue;
    }

    output.push(`<p>${escapeHtml(trimmed)}</p>`);
  }

  closeListIfOpen();
  return output.join('');
}

function getSection(slug: string): SectionPayload | null {
  try {
    const section = bookSections.findBySlug(slug);

    if (!section) {
      return null;
    }

    const orderedSlugs = bookSections.findPublishedSlugsOrdered();
    const slugs = orderedSlugs.map((entry) => entry.slug);
    const sectionPosition = slugs.findIndex((entrySlug) => entrySlug === section.slug);
    const previousSlug = sectionPosition > 0 ? slugs[sectionPosition - 1] : undefined;
    const nextSlug =
      sectionPosition >= 0 && sectionPosition < slugs.length - 1
        ? slugs[sectionPosition + 1]
        : undefined;

    return {
      section: {
        slug: section.slug,
        title: section.section_title,
        part: { slug: section.part_slug, title: section.part_title },
        chapter: { slug: section.chapter_slug, title: section.chapter_title },
      },
      frontmatter: section.frontmatter ? JSON.parse(section.frontmatter) : {
        summary: [],
        checklist: [],
        mistakes: [],
        drill: {},
      },
      body: {
        content: section.body_markdown,
      },
      headings: section.headings ? JSON.parse(section.headings) : [],
      previousSlug,
      nextSlug,
    };
  } catch {
    return null;
  }
}

export default async function ReaderPage({ params }: SectionPageProps) {
  const sectionSlug = params.slug?.join('/') ?? '';
  const payload = getSection(sectionSlug);

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
        <div
          dangerouslySetInnerHTML={{
            __html: renderMarkdown(
              payload.body?.content ?? 'No body content is available for this section.',
            ),
          }}
        />
      </div>

      <div className="flex items-center justify-between border-t pt-4">
        {payload.previousSlug ? (
          <Button asChild variant="outline">
            <Link href={`/book/${payload.previousSlug}`}>
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Link>
          </Button>
        ) : (
          <Button asChild variant="outline">
            <Link href="/book">
              <ChevronLeft className="h-4 w-4" />
              Library
            </Link>
          </Button>
        )}

        {payload.nextSlug ? (
          <Button asChild>
            <Link href={`/book/${payload.nextSlug}`}>
              Next
              <ChevronRight className="h-4 w-4" />
            </Link>
          </Button>
        ) : (
          <Button asChild>
            <Link href="/book">Reader home</Link>
          </Button>
        )}
      </div>
    </article>
  );
}
