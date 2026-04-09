'use client';

import type { ReactNode } from 'react';
import { WalletProvider } from '@/contexts/WalletContext';
import CommandSurface from '@/components/terminal/CommandSurface';
import FooterStatusBar from '@/components/terminal/FooterStatusBar';
import TerminalShell from '@/components/terminal/TerminalShell';

export default function TerminalLayout({ children }: { children: ReactNode }) {
  return (
    <WalletProvider>
      <TerminalShell>{children}</TerminalShell>
      <CommandSurface />
      <FooterStatusBar />
    </WalletProvider>
  );
}
