/**
 * GET /api/chambers/pulse
 *
 * C-305 FIX-507-05: Pulse chamber unified data aggregator.
 * Replaces N independent component fetches with a single parallel fan-out
 * over the 9 Pulse-relevant data sources. Result is KV-cached for 15s so
 * concurrent component mounts share one Render round-trip.
 *
 * Cache-Control: public, s-maxage=15, stale-while-revalidate=30
 */

import { NextResponse } from 'next/server';
import { kvGet, kvSet } from '@/lib/kv/store';

export const dynamic = 'force-dynamic';

const PULSE_CACHE_KEY = 'pulse:aggregated:cache';
const PULSE_CACHE_TTL_MS = 15_000;
const PULSE_CACHE_TTL_SEC = 30;

type PulseCache = { data: PulsePayload; cachedAt: number };

export type PulsePayload = {
  _meta: { generatedAt: number; cycle: string; sources: number };
  snapshot: unknown;
  epicon: unknown;
  mii: unknown;
  agentJournal: unknown;
  vaultStatus: unknown;
  laneDiagnostics: unknown;
  integrityStatus: unknown;
  echoDigest: unknown;
  substrateCanon: unknown;
};

async function fetchInternal(path: string): Promise<unknown> {
  const base = (
    process.env.NEXT_PUBLIC_TERMINAL_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    'https://mobius-civic-ai-terminal.vercel.app'
  ).replace(/\/+$/, '');

  try {
    const res = await fetch(`${base}${path}`, {
      headers: { 'x-internal-request': '1', 'x-pulse-aggregator': '1' },
      signal: AbortSignal.timeout(8_000),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  }
}

export async function GET(): Promise<NextResponse> {
  const cached = await kvGet<PulseCache>(PULSE_CACHE_KEY);
  if (cached && Date.now() - cached.cachedAt < PULSE_CACHE_TTL_MS) {
    return NextResponse.json(cached.data, {
      headers: {
        'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30',
        'X-Cache': 'HIT',
        'X-Cached-At': new Date(cached.cachedAt).toISOString(),
      },
    });
  }

  const [
    snapshot,
    epicon,
    mii,
    agentJournal,
    vaultStatus,
    laneDiag,
    integrityStatus,
    echoDigest,
    substrateCanon,
  ] = await Promise.allSettled([
    fetchInternal('/api/terminal/snapshot-lite'),
    fetchInternal('/api/epicon/feed?limit=50'),
    fetchInternal('/api/mii/feed'),
    fetchInternal('/api/agents/journal'),
    fetchInternal('/api/vault/status'),
    fetchInternal('/api/chambers/lane-diagnostics'),
    fetchInternal('/api/integrity-status'),
    fetchInternal('/api/echo/digest'),
    fetchInternal('/api/substrate/canon'),
  ]);

  const resolve = <T>(r: PromiseSettledResult<T>): T | null =>
    r.status === 'fulfilled' ? r.value : null;

  const data: PulsePayload = {
    _meta: {
      generatedAt: Date.now(),
      cycle: process.env.CURRENT_CYCLE ?? 'C-305',
      sources: 9,
    },
    snapshot:        resolve(snapshot),
    epicon:          resolve(epicon),
    mii:             resolve(mii),
    agentJournal:    resolve(agentJournal),
    vaultStatus:     resolve(vaultStatus),
    laneDiagnostics: resolve(laneDiag),
    integrityStatus: resolve(integrityStatus),
    echoDigest:      resolve(echoDigest),
    substrateCanon:  resolve(substrateCanon),
  };

  // FIX-510-03: guard against null/empty payload before KV write to avoid silent errors
  if (data && data._meta) {
    kvSet<PulseCache>(PULSE_CACHE_KEY, { data, cachedAt: Date.now() }, 30).catch(
      (err: unknown) => console.warn('[pulse] KV cache write failed:', (err as Error)?.message),
    );
  }

  return NextResponse.json(data, {
    headers: {
      'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30',
      'X-Cache': 'MISS',
    },
  });
}
