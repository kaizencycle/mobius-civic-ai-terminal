import type { ReactNode } from 'react';
import { WalletProvider } from '@/contexts/WalletContext';
import CommandSurface from '@/components/terminal/CommandSurface';
import FooterStatusBar from '@/components/terminal/FooterStatusBar';
import TerminalShell from '@/components/terminal/TerminalShell';
import { EchoDigestProvider } from '@/components/terminal/EchoDigestProvider';

type ShellSeed = {
  gi?: number | null;
  mode?: string | null;
  cycle?: string | null;
  degraded?: boolean;
  tripwire?: { count?: number; elevated?: boolean };
  heartbeat?: { runtime?: string | null; journal?: string | null };
  source?: 'live' | 'fallback';
  timestamp?: string | null;
};

async function loadSeed(): Promise<ShellSeed | null> {
  try {
    const res = await fetch('/api/terminal/shell', {
      next: { revalidate: 15 },
      cache: 'force-cache',
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as ShellSeed;
    return {
      gi: typeof data.gi === 'number' ? data.gi : null,
      mode: typeof data.mode === 'string' ? data.mode : null,
      cycle: typeof data.cycle === 'string' ? data.cycle : null,
      degraded: Boolean(data.degraded),
      tripwire: data.tripwire ?? { count: 0, elevated: false },
      heartbeat: data.heartbeat ?? { runtime: null, journal: null },
      source: data.source ?? 'fallback',
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
            __html: `window.__MOBIUS_SHELL_SEED__=${JSON.stringify(seed)};`,
          }}
        />
      ) : null}
      <EchoDigestProvider>
        <TerminalShell>{children}</TerminalShell>
      </EchoDigestProvider>
      <CommandSurface />
      <FooterStatusBar />
    </WalletProvider>
  );
}
