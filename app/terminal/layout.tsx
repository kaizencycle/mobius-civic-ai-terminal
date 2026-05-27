import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { WalletProvider } from '@/contexts/WalletContext';
import { computeCurrentCycleId } from '@/lib/terminal/cycle';
import { CycleProvider } from '@/components/terminal/CycleProvider';

// OPT-19: Never use VERCEL_URL — that is the preview deployment URL, not canonical.
const BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ||
  process.env.NEXT_PUBLIC_CANONICAL_URL?.replace(/\/$/, '') ||
  'https://mobius-civic-ai-terminal.vercel.app';

const OG_IMAGE = `${BASE_URL}/og-terminal.png`;

// OPT-13: summary_large_image so the full OG card renders on social shares.
// OPT-19: og:url always uses canonical BASE_URL, never a preview deployment path.
export function chamberMeta(chamber: string, description: string, path: string): Metadata {
  const title = `${chamber} · Mobius Terminal`;
  const url = `${BASE_URL}/terminal/${path}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      images: [{ url: OG_IMAGE, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [OG_IMAGE],
    },
  };
}
import CommandSurface from '@/components/terminal/CommandSurface';
import FooterStatusBar from '@/components/terminal/FooterStatusBar';
import { ShellSnapshotProvider } from '@/components/terminal/ShellSnapshotProvider';
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
  // OPT-02: Derive cycle synchronously at SSR time so every chamber inherits it
  // from the provider and never shows C-— on first render.
  const initialCycle = seed?.cycle ?? computeCurrentCycleId();
  return (
    <WalletProvider>
      <ShellSnapshotProvider>
        {seed ? (
          <script
            dangerouslySetInnerHTML={{
              __html: `window.__MOBIUS_SHELL_SEED__=${JSON.stringify(seed)};`,
            }}
          />
        ) : null}
        <CycleProvider initialCycle={initialCycle}>
          <EchoDigestProvider>
            <TerminalShell>{children}</TerminalShell>
          </EchoDigestProvider>
          <CommandSurface />
          <FooterStatusBar />
        </CycleProvider>
      </ShellSnapshotProvider>
    </WalletProvider>
  );
}
