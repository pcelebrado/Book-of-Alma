'use client';

import { Loader2, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

type SkillKey =
  | 'explain'
  | 'socratic'
  | 'flashcards'
  | 'checklist'
  | 'scenario_tree'
  | 'notes_assist';

const skillOptions: Array<{ key: SkillKey; label: string }> = [
  { key: 'explain', label: 'Explain' },
  { key: 'socratic', label: 'Socratic Tutor' },
  { key: 'flashcards', label: 'Flashcards' },
  { key: 'checklist', label: 'Checklist' },
  { key: 'scenario_tree', label: 'Scenario Tree' },
  { key: 'notes_assist', label: 'Notes Assist' },
];

export function AgentPanel({ sectionSlug }: { sectionSlug?: string }) {
  const [skill, setSkill] = useState<SkillKey>('explain');
  const [output, setOutput] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const helperCopy = useMemo(() => {
    if (error?.toLowerCase().includes('core_unavailable') || error?.toLowerCase().includes('core')) {
      return {
        title: 'Assistant temporarily unavailable',
        body: 'Try again in a moment. You can continue reading while the assistant wakes.',
      };
    }

    return {
      title: 'Waking assistant…',
      body: 'This can take a few seconds after inactivity.',
    };
  }, [error]);

  const runSkill = async () => {
    setLoading(true);
    setError(null);
    setOutput('');

    try {
      if (!sectionSlug) {
        throw new Error('No section selected. Open a book section first.');
      }

      const response = await fetch('/api/agent/skill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skill,
          context: {
            sectionSlug,
            mode: 'simple',
          },
        }),
      });

      const payload = (await response.json()) as Record<string, unknown>;
      if (!response.ok) {
        const err = payload.error as { code?: string; message?: string } | undefined;
        throw new Error(err?.code ? `${err.code}: ${err.message ?? 'Request failed'}` : 'Agent request failed');
      }

      setOutput(JSON.stringify(payload, null, 2));
      toast.success('Skill completed.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Agent temporarily unavailable';
      setError(message);
      toast.error('Agent temporarily unavailable. Retry later.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4" />
          Assistant
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Tabs value={skill} onValueChange={(value) => setSkill(value as SkillKey)}>
          <TabsList className="grid grid-cols-2 gap-1 bg-transparent p-0">
            {skillOptions.map((option) => (
              <TabsTrigger key={option.key} value={option.key} className="h-8 text-xs">
                {option.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex gap-2">
          <Button onClick={runSkill} disabled={loading} className="flex-1">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loading ? 'Running...' : 'Run skill'}
          </Button>
          <Button variant="outline" onClick={() => setOutput('')}>
            Clear
          </Button>
        </div>

        {error ? (
          <Alert>
            <AlertTitle>{helperCopy.title}</AlertTitle>
            <AlertDescription>{helperCopy.body}</AlertDescription>
          </Alert>
        ) : null}

        {output ? (
          <ScrollArea className="h-56 rounded-md border p-3">
            <pre className="whitespace-pre-wrap text-xs text-muted-foreground">{output}</pre>
          </ScrollArea>
        ) : (
          <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
            Select a skill and click Run to analyze the current section.
          </div>
        )}

        <Textarea
          readOnly
          value="Educational use only. Assistant outputs are guidance, not financial advice."
          className="min-h-[68px] text-xs"
        />
      </CardContent>
    </Card>
  );
}
