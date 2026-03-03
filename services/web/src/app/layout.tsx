import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

import { AppShell } from '@/components/app-shell';

import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'OpenClaw | Book-First Learning',
  description:
    'Education and playbook guidance for SPY options traders. Book-first learning environment.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} antialiased`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
