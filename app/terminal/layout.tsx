import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { WalletProvider } from '@/contexts/WalletContext';
import { computeCurrentCycleId } from '@/lib/terminal/cycle';
import { CycleProvider } from '@/components/terminal/CycleProvider';
import { CANONICAL_TERMINAL_ORIGIN } from '@/lib/site/canonicalUrl';

// OPT-19: Never use VERCEL_URL — that is the preview deployment URL, not canonical.
const BASE_URL = CANONICAL_TERMINAL_ORIGIN;

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
import { getCanonicalSnapshot } from '@/lib/dal/getCanonicalSnapshot';
import { resolveOperatorCycleId } from '@/lib/eve/resolve-operator-cycle';

type ShellSeed = {
  gi?: number | null;
  mode?: string | null;
  cycle?: string | null;
  degraded?: boolean;
  tripwire?: { count?: number; elevated?: boolean };
  heartbeat?: { runtime?: string | null; journal?: string | null };
  source?: 'live' | 'fallback';
  timestamp?: string | null;
  // C-303 Phase 3: vault + sentinel enrichment so first paint is non-blank.
  vault_headline?: string | null;
  vault_reserve_blocks?: number | null;
  vault_attestation_gap?: boolean | null;
  sentinel_posture?: string | null;
};

// C-303 Phase 3: replaces the internal HTTP self-fetch (fetch('/api/terminal/shell'))
// with direct DAL calls. No recursive HTTP round-trip; no cold-start latency spike.
// getCanonicalSnapshot is capped at 2s — if it times out, the shell still renders
// with the richer data it managed to collect.
async function loadSeed(): Promise<ShellSeed | null> {
  try {
    let cycle: string;
    try {
      cycle = await resolveOperatorCycleId();
    } catch {
      cycle = computeCurrentCycleId();
    }

    const snapshot = await Promise.race([
      getCanonicalSnapshot(cycle),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
    ]);

    if (!snapshot) return null;

    const integrity = snapshot.lanes.integrity;
    const vault = snapshot.lanes.vault;
    const sentinel = snapshot.lanes.sentinel;

    const gi = typeof (integrity.data as { global_integrity?: unknown })?.global_integrity === 'number'
      ? (integrity.data as { global_integrity: number }).global_integrity
      : null;
    const mode = (integrity.data as { mode?: string } | null)?.mode ?? null;

    const vaultData = vault.data as {
      headline?: string;
      reserve_block_lane?: string;
      status?: string;
    } | null;
    const attestationCoverage = snapshot.lanes.vault.data as {
      attestation_gap?: boolean;
    } | null;

    return {
      gi,
      mode,
      cycle,
      degraded: snapshot.degraded,
      tripwire: { count: 0, elevated: false },
      heartbeat: { runtime: null, journal: null },
      source: snapshot.degraded ? 'fallback' : 'live',
      timestamp: snapshot.generated_at,
      vault_headline: vaultData?.headline ?? null,
      vault_reserve_blocks: null,
      vault_attestation_gap: attestationCoverage?.attestation_gap ?? null,
      sentinel_posture: (sentinel.data as { posture?: string } | null)?.posture ?? null,
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
