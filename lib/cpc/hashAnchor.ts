/**
 * Posts .dat file hash anchors to CPC (Civic-Protocol-Core ledger).
 * CPC stores hash proofs only — full data lives in GitHub.
 *
 * EPICON: C-357 | RESERVE_BLOCK_DAT_CANONIZATION
 */

import type { DatHashAnchorPayload, DatHashAnchorResponse } from '@/lib/dat/types';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

const CPC_LEDGER_HOST_FALLBACK = 'https://civic-protocol-core-ledger.onrender.com';

export interface AnchorResult {
  success: boolean;
  action?: 'anchored' | 'idempotent';
  error?: string;
  retries?: number;
}

function normalizeHostBase(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '');
  if (!trimmed) return '';

  // CIVIC_LEDGER_URL is often a full attest path, not a host root.
  if (trimmed.includes('/api/')) {
    try {
      return new URL(trimmed).origin;
    } catch {
      return trimmed.split('/api/')[0] ?? trimmed;
    }
  }

  return trimmed;
}

/**
 * Resolve CPC ledger host for canon reserve-block routes.
 * Priority: CPC_BASE_URL → RENDER_LEDGER_URL → CIVIC_LEDGER_URL (origin) → public ledger URL.
 */
export function resolveCpcBaseUrl(): string {
  const candidates = [
    process.env.CPC_BASE_URL,
    process.env.RENDER_LEDGER_URL,
    process.env.CIVIC_LEDGER_URL,
    process.env.NEXT_PUBLIC_CIVIC_LEDGER_URL,
  ].filter(Boolean) as string[];

  for (const raw of candidates) {
    const base = normalizeHostBase(raw);
    if (!base) continue;
    if (base.includes('github.com') || base.includes('api.github.com')) {
      continue;
    }
    return base;
  }

  return CPC_LEDGER_HOST_FALLBACK;
}

export async function postHashAnchor(payload: DatHashAnchorPayload): Promise<AnchorResult> {
  const base = resolveCpcBaseUrl();
  const token = process.env.AGENT_SERVICE_TOKEN;

  if (!base) {
    return { success: false, error: 'CPC_BASE_URL / CIVIC_LEDGER_URL not set' };
  }
  if (!token) {
    return { success: false, error: 'AGENT_SERVICE_TOKEN not set' };
  }

  const url = `${base}/api/canon/reserve-blocks/anchor`;
  let lastError = '';

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Mobius-EPICON': 'C-357:RESERVE_BLOCK_DAT_CANONIZATION',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000),
      });

      if (res.status === 409) {
        const body = (await res.json()) as { detail?: string };
        return {
          success: false,
          error: `CANON CONFLICT on ${payload.dat_file}: ${body.detail ?? 'hash mismatch'}`,
          retries: attempt,
        };
      }

      if (!res.ok) {
        lastError = `CPC ${res.status}: ${await res.text()}`;
        if (attempt < MAX_RETRIES) {
          await delay(RETRY_DELAY_MS * attempt);
          continue;
        }
        return { success: false, error: lastError, retries: attempt };
      }

      const data = (await res.json()) as DatHashAnchorResponse;
      return {
        success: true,
        action: data.action,
        retries: attempt,
      };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      if (attempt < MAX_RETRIES) {
        await delay(RETRY_DELAY_MS * attempt);
      }
    }
  }

  return { success: false, error: lastError, retries: MAX_RETRIES };
}

export interface CpcManifestResponse {
  total_dat_files: number;
  total_blocks_anchored: number;
  total_mic_anchored: number;
  chain_tip: string | null;
  chain_tip_hash: string | null;
  anchors: Array<{
    id: number;
    dat_file: string;
    file_hash: string;
    block_range_start: number;
    block_range_end: number;
    block_count: number;
    chain_tip_hash: string;
    version: string;
    canonized_at: string;
    created_at: string;
  }>;
}

export async function fetchCpcManifest(): Promise<CpcManifestResponse | null> {
  const base = resolveCpcBaseUrl();
  if (!base) return null;

  try {
    const res = await fetch(`${base}/api/canon/reserve-blocks/manifest`, {
      headers: { 'Cache-Control': 'no-cache' },
      next: { revalidate: 60 },
    });

    if (!res.ok) return null;
    return res.json() as Promise<CpcManifestResponse>;
  } catch {
    return null;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
