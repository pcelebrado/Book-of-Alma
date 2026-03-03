'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface PlaybookItem {
  _id: string;
  status: 'draft' | 'published' | 'archived';
  title: string;
  triggers: string[];
  linkedSections: string[];
  updatedAt: string;
}

export default function PlaybooksPage() {
  const [playbooks, setPlaybooks] = useState<PlaybookItem[]>([]);

  useEffect(() => {
    const loadPlaybooks = async () => {
      const response = await fetch('/api/playbooks', { cache: 'no-store' });
      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as { playbooks?: PlaybookItem[] };
      setPlaybooks(payload.playbooks ?? []);
    };

    void loadPlaybooks();
  }, []);

  const drafts = useMemo(() => playbooks.filter((item) => item.status === 'draft'), [playbooks]);
  const published = useMemo(() => playbooks.filter((item) => item.status === 'published'), [playbooks]);

  return (
    <div className="space-y-6 pb-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tightish">Playbooks</h1>
          <p className="mt-2 text-sm text-muted-foreground">Draft and publish playbooks from section-level learning.</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/book">Generate from section</Link>
        </Button>
      </div>

      <Tabs defaultValue="drafts" className="space-y-4">
        <TabsList>
          <TabsTrigger value="drafts">Draft</TabsTrigger>
          <TabsTrigger value="published">Published</TabsTrigger>
        </TabsList>

        <TabsContent value="drafts" className="space-y-4">
          {drafts.length > 0 ? (
            drafts.map((playbook) => (
              <Card key={playbook._id}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    {playbook.title}
                    <Badge>{playbook.status}</Badge>
                  </CardTitle>
                  <CardDescription>{playbook.triggers.join(', ') || 'No trigger summary yet.'}</CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Linked sections: {playbook.linkedSections.length}
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>No drafts yet.</CardTitle>
                <CardDescription>Generate a draft from a section using Scenario Tree.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild>
                  <Link href="/book">Open Reader</Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="published" className="space-y-4">
          {published.length > 0 ? (
            published.map((playbook) => (
              <Card key={playbook._id}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    {playbook.title}
                    <Badge variant="secondary">published</Badge>
                  </CardTitle>
                  <CardDescription>Updated {new Date(playbook.updatedAt).toLocaleString()}</CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Linked sections: {playbook.linkedSections.length}
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>No playbooks published yet.</CardTitle>
                <CardDescription>Publish a draft when your checklist and scenario tree are ready.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild variant="outline">
                  <Link href="/book">Open Reader</Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
