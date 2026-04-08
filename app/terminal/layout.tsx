'use client';

import type { ReactNode } from 'react';
import { WalletProvider } from '@/contexts/WalletContext';
import CommandSurface from '@/components/terminal/CommandSurface';
import FooterStatusBar from '@/components/terminal/FooterStatusBar';
import TerminalHeader from '@/components/terminal/TerminalHeader';

export default function TerminalLayout({ children }: { children: ReactNode }) {
  return (
    <WalletProvider>
      <div className="flex h-screen flex-col overflow-hidden bg-[#020617] text-slate-100">
        <TerminalHeader />
        <main className="min-h-0 flex-1 overflow-hidden pb-28">{children}</main>
        <CommandSurface />
        <FooterStatusBar />
      </div>
    </WalletProvider>
  );
}
