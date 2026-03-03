'use client';

import { BookOpen, Command, Menu, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { Toaster } from 'sonner';

import { AgentPanel } from '@/components/agent-panel';
import { CommandPalette } from '@/components/command-palette';
import { TOCTree } from '@/components/toc-tree';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';

const navItems = [
  { href: '/', label: 'Library' },
  { href: '/book', label: 'Reader' },
  { href: '/notes', label: 'Notes' },
  { href: '/playbooks', label: 'Playbooks' },
  { href: '/admin', label: 'Admin' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const isPublicPage = useMemo(
    () => pathname === '/login' || pathname === '/onboarding',
    [pathname],
  );

  const sectionSlug = useMemo(() => {
    if (!pathname?.startsWith('/book/')) {
      return 'part-1-foundations/ch-1/01-gamma-basics';
    }
    return pathname.replace('/book/', '');
  }, [pathname]);

  if (isPublicPage) {
    return (
      <>
        {children}
        <CommandPalette />
        <Toaster richColors position="top-right" />
      </>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-background text-foreground">
        <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-3 px-4 lg:px-6">
            <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold tracking-tightish">
              <BookOpen className="h-4 w-4" />
              OpenClaw
            </Link>

            <nav className="hidden items-center gap-1 lg:flex">
              {navItems.map((item) => (
                <Button key={item.href} asChild variant={pathname === item.href ? 'secondary' : 'ghost'} size="sm">
                  <Link href={item.href}>{item.label}</Link>
                </Button>
              ))}
            </nav>

            <div className="ml-auto flex items-center gap-2">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" className="xl:hidden">
                    <Menu className="h-4 w-4" />
                    Contents
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[300px] sm:max-w-[300px]">
                  <SheetHeader>
                    <SheetTitle>Contents</SheetTitle>
                  </SheetHeader>
                  <div className="mt-4">
                    <TOCTree />
                  </div>
                </SheetContent>
              </Sheet>

              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="secondary" size="sm" className="2xl:hidden">
                    <Sparkles className="h-4 w-4" />
                    Assistant
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-[360px] sm:max-w-[360px]">
                  <SheetHeader>
                    <SheetTitle>Assistant</SheetTitle>
                  </SheetHeader>
                  <div className="mt-4 h-[calc(100vh-96px)]">
                    <AgentPanel sectionSlug={sectionSlug} />
                  </div>
                </SheetContent>
              </Sheet>

              <Button variant="outline" size="sm" className="hidden sm:inline-flex">
                <Command className="h-4 w-4" />
                Command
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm">
                    Account
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link href="/onboarding">Onboarding</Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/login">Sign in</Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        <div className="mx-auto grid max-w-[1280px] gap-6 px-4 py-4 lg:px-6 xl:grid-cols-[280px_minmax(0,1fr)] 2xl:grid-cols-[280px_minmax(0,760px)_360px]">
          <aside className="hidden xl:block">
            <div className="sticky top-20">
              <TOCTree />
            </div>
          </aside>

          <ScrollArea className="h-[calc(100vh-96px)] pr-2">
            <main>{children}</main>
          </ScrollArea>

          <aside className="hidden 2xl:block">
            <div className="sticky top-20 h-[calc(100vh-96px)]">
              <AgentPanel sectionSlug={sectionSlug} />
            </div>
          </aside>
        </div>
      </div>

      <CommandPalette />
      <Toaster richColors position="top-right" />
    </>
  );
}
