'use client';

import { Copy, Highlighter, NotebookPen, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

export function HighlightToolbar({ sectionSlug }: { sectionSlug: string }) {
  const [visible, setVisible] = useState(false);
  const [selection, setSelection] = useState('');
  const [top, setTop] = useState(0);
  const [left, setLeft] = useState(0);
  const [openNote, setOpenNote] = useState(false);
  const [noteText, setNoteText] = useState('');

  useEffect(() => {
    const onSelectionChange = () => {
      const selected = window.getSelection();
      const text = selected?.toString().trim() ?? '';
      if (!text || !selected || selected.rangeCount === 0) {
        setVisible(false);
        return;
      }

      const rect = selected.getRangeAt(0).getBoundingClientRect();
      if (!rect.width && !rect.height) {
        setVisible(false);
        return;
      }

      setSelection(text);
      setTop(rect.top + window.scrollY - 44);
      setLeft(rect.left + window.scrollX + rect.width / 2 - 90);
      setVisible(true);
    };

    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, []);

  const saveHighlight = async () => {
    if (!selection) {
      return;
    }

    const response = await fetch('/api/highlights', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sectionSlug,
        text: selection,
        range: {
          startOffset: 0,
          endOffset: selection.length,
        },
      }),
    });

    if (response.ok) {
      toast.success('Highlight saved.');
      setVisible(false);
      return;
    }

    toast.error('Failed to save highlight. Retry.');
  };

  const saveNote = async () => {
    const response = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sectionSlug,
        noteText: noteText || selection,
        selection: {
          text: selection,
          startOffset: 0,
          endOffset: selection.length,
        },
      }),
    });

    if (response.ok) {
      toast.success('Note saved.');
      setOpenNote(false);
      setVisible(false);
      setNoteText('');
      return;
    }

    toast.error('Failed to save note. Retry.');
  };

  if (!visible) {
    return null;
  }

  return (
    <>
      <div
        className="absolute z-40 flex items-center gap-1 rounded-lg border bg-card p-1 shadow"
        style={{ top, left }}
      >
        <Button size="icon" variant="ghost" aria-label="Highlight text" onClick={() => void saveHighlight()}>
          <Highlighter className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          aria-label="Add note"
          onClick={() => {
            setNoteText(selection);
            setOpenNote(true);
          }}
        >
          <NotebookPen className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          aria-label="Copy selection"
          onClick={() => {
            void navigator.clipboard.writeText(selection);
            toast.success('Copied to clipboard.');
            setVisible(false);
          }}
        >
          <Copy className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" aria-label="Dismiss" onClick={() => setVisible(false)}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <Dialog open={openNote} onOpenChange={setOpenNote}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add note</DialogTitle>
            <DialogDescription>Attach this note to the selected text.</DialogDescription>
          </DialogHeader>
          <Textarea value={noteText} onChange={(event) => setNoteText(event.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenNote(false)}>
              Cancel
            </Button>
            <Button onClick={() => void saveNote()}>Save note</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
