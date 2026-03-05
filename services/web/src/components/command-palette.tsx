'use client';

import { BookOpen, FileText, NotebookPen, Shield, Sparkles } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command';

interface ActionItem {
  label: string;
  href: string;
  shortcut?: string;
  icon: React.ReactNode;
}

const navigationActions: ActionItem[] = [
  { label: 'Go to Library', href: '/', icon: <BookOpen className="h-4 w-4" />, shortcut: 'G L' },
  { label: 'Open Reader', href: '/book', icon: <BookOpen className="h-4 w-4" />, shortcut: 'G R' },
  { label: 'Go to Notes', href: '/notes', icon: <NotebookPen className="h-4 w-4" />, shortcut: 'G N' },
  { label: 'Go to Playbooks', href: '/playbooks', icon: <FileText className="h-4 w-4" />, shortcut: 'G P' },
  { label: 'Go to Admin', href: '/admin', icon: <Shield className="h-4 w-4" />, shortcut: 'G A' },
];

const creationActions: ActionItem[] = [
  { label: 'Create a note', href: '/notes', icon: <NotebookPen className="h-4 w-4" />, shortcut: 'N' },
  { label: 'Open playbook drafts', href: '/playbooks', icon: <FileText className="h-4 w-4" /> },
  { label: 'Open assistant tools', href: '/book', icon: <Sparkles className="h-4 w-4" /> },
];

export function CommandPalette() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.key === 'k' && (event.metaKey || event.ctrlKey)) || event.key === '/') {
        const target = event.target as HTMLElement | null;
        if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') {
          return;
        }
        event.preventDefault();
        setOpen((current) => !current);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const runAction = (href: string) => {
    setOpen(false);
    if (href === pathname) {
      return;
    }
    router.push(href);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search pages and actions..." aria-label="Search actions" />
      <CommandList>
        <CommandEmpty>No results. Try another command.</CommandEmpty>
        <CommandGroup heading="Navigation">
          {navigationActions.map((action) => (
            <CommandItem key={action.label} onSelect={() => runAction(action.href)}>
              {action.icon}
              <span>{action.label}</span>
              {action.shortcut ? <CommandShortcut>{action.shortcut}</CommandShortcut> : null}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Create">
          {creationActions.map((action) => (
            <CommandItem key={action.label} onSelect={() => runAction(action.href)}>
              {action.icon}
              <span>{action.label}</span>
              {action.shortcut ? <CommandShortcut>{action.shortcut}</CommandShortcut> : null}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
