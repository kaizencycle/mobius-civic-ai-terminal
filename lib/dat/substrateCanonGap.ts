/**
 * Compare hot KV sealed block count vs cold Substrate MANIFEST.
 * EPICON: C-368 PR7 | RESERVE_BLOCK_DAT_CANONIZATION
 */

const DEFAULT_TERMINAL_URL = 'https://mobius-civic-ai-terminal.vercel.app';
const DEFAULT_SUBSTRATE_MANIFEST_URL =
  'https://raw.githubusercontent.com/kaizencycle/Mobius-Substrate/main/canon/reserve-blocks/MANIFEST.json';

export interface CanonGapSnapshot {
  sealed_hot: number;
  canonized_cold: number;
  gap: number;
  in_progress_block: number | null;
  terminal_url: string;
  manifest_url: string;
  manifest_present: boolean;
}

export async function fetchCanonGap(options?: {
  terminalUrl?: string;
  manifestUrl?: string;
}): Promise<CanonGapSnapshot> {
  const terminalUrl = (options?.terminalUrl ?? process.env.TERMINAL_API_BASE ?? DEFAULT_TERMINAL_URL).replace(
    /\/$/,
    '',
  );
  const manifestUrl = options?.manifestUrl ?? DEFAULT_SUBSTRATE_MANIFEST_URL;

  const statusRes = await fetch(`${terminalUrl}/api/vault/status`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
    cache: 'no-store',
  });

  if (!statusRes.ok) {
    throw new Error(`vault/status ${statusRes.status}`);
  }

  const status = (await statusRes.json()) as {
    reserve_blocks_sealed?: number;
    reserve_block?: { sealed_blocks?: number; in_progress_block?: number };
  };

  const sealedHot =
    status.reserve_blocks_sealed ??
    status.reserve_block?.sealed_blocks ??
    0;
  const inProgress = status.reserve_block?.in_progress_block ?? null;

  let canonizedCold = 0;
  let manifestPresent = false;

  const manifestRes = await fetch(manifestUrl, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
    cache: 'no-store',
  });

  if (manifestRes.ok) {
    manifestPresent = true;
    const manifest = (await manifestRes.json()) as { total_blocks?: number };
    canonizedCold = typeof manifest.total_blocks === 'number' ? manifest.total_blocks : 0;
  }

  const gap = Math.max(0, sealedHot - canonizedCold);

  return {
    sealed_hot: sealedHot,
    canonized_cold: canonizedCold,
    gap,
    in_progress_block: inProgress,
    terminal_url: terminalUrl,
    manifest_url: manifestUrl,
    manifest_present: manifestPresent,
  };
}
