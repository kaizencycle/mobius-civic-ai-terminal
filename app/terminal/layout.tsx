import type { ReactNode } from 'react';
import { WalletProvider } from '@/contexts/WalletContext';
import CommandSurface from '@/components/terminal/CommandSurface';
import FooterStatusBar from '@/components/terminal/FooterStatusBar';
import TerminalShell from '@/components/terminal/TerminalShell';

type SnapshotLiteSeed = {
  gi?: number | null;
  mode?: string | null;
  cycle?: string | null;
  timestamp?: string | null;
};

async function loadSeed(): Promise<SnapshotLiteSeed | null> {
  try {
    const res = await fetch('/api/terminal/snapshot-lite', {
      next: { revalidate: 15 },
      cache: 'force-cache',
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as SnapshotLiteSeed;
    return {
      gi: typeof data.gi === 'number' ? data.gi : null,
      mode: typeof data.mode === 'string' ? data.mode : null,
      cycle: typeof data.cycle === 'string' ? data.cycle : null,
      timestamp: typeof data.timestamp === 'string' ? data.timestamp : null,
    };
  } catch {
    return null;
  }
}

export default async function TerminalLayout({ children }: { children: ReactNode }) {
  const seed = await loadSeed();
  return (
    <WalletProvider>
      {seed ? (
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__MOBIUS_SEED__=${JSON.stringify(seed)};`,
          }}
        />
      ) : null}
      <TerminalShell>{children}</TerminalShell>
      <CommandSurface />
      <FooterStatusBar />
    </WalletProvider>
  );
}
