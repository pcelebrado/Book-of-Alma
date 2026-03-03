import { AlertCircle } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface DrillShape {
  prompt?: string;
  answerKey?: string;
}

interface Frontmatter {
  summary?: string[];
  checklist?: string[];
  mistakes?: string[];
  drill?: DrillShape;
}

function ListOrStub({ title, items, fallback }: { title: string; items?: string[]; fallback: string }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {items && items.length > 0 ? (
          <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            {items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{fallback}</p>
        )}
      </CardContent>
    </Card>
  );
}

export function SectionBlocks({ frontmatter }: { frontmatter?: Frontmatter }) {
  return (
    <div className="space-y-4">
      <ListOrStub
        title="TL;DR"
        items={frontmatter?.summary}
        fallback="This section's summary will appear here."
      />
      <ListOrStub
        title="Checklist"
        items={frontmatter?.checklist}
        fallback="Checklist (coming soon)."
      />

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Common Mistakes</AlertTitle>
        <AlertDescription>
          {frontmatter?.mistakes && frontmatter.mistakes.length > 0
            ? frontmatter.mistakes.join(' | ')
            : 'Mistakes (coming soon).'}
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Drill</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>{frontmatter?.drill?.prompt ?? 'Drill prompt coming soon.'}</p>
          {frontmatter?.drill?.answerKey ? (
            <p className="text-xs text-muted-foreground">Answer key: {frontmatter.drill.answerKey}</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
