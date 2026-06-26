import { NextResponse } from 'next/server';
import { computeIntegrityPayload } from '@/lib/integrity/buildStatus';
import { getEchoIntegrity } from '@/lib/echo/store';
import { resolveGiChain } from '@/lib/gi/resolveGiChain';
import { loadMicReadinessSnapshotRaw } from '@/lib/mic/loadReadinessSnapshot';
import { kvGet, kvSet } from '@/lib/kv/store';

// OPT-07 (C-312): integrity-status is called on every page init and hits Render GIC
// on every request. GI changes only on cron ticks (5-10min). 60s KV cache reduces
// Render GIC load by ~95% at typical page-load rates.
const INTEGRITY_CACHE_KEY = 'cache:integrity-status';
const INTEGRITY_CACHE_TTL = 60;

export const dynamic = 'force-dynamic';

// Fix 4: read MIC totals from KV when in-memory ECHO store is empty (cold start)
async function echoMicProvisional(): Promise<{ totalMicProvisional: number; totalMicMinted: number }> {
  const i = getEchoIntegrity();
  const inMemory =
    i && typeof i.totalMicProvisional === 'number' && i.totalMicProvisional > 0
      ? i.totalMicProvisional
      : i && typeof i.totalMicMinted === 'number' && i.totalMicMinted > 0
        ? i.totalMicMinted
        : 0;

  if (inMemory > 0) return { totalMicProvisional: inMemory, totalMicMinted: inMemory };

  try {
    const kv = await kvGet<{ totalMicProvisional?: number; totalMicMinted?: number }>('mic:cycle:totals');
    const v = kv?.totalMicProvisional ?? kv?.totalMicMinted ?? 0;
    return { totalMicProvisional: v, totalMicMinted: v };
  } catch {
    return { totalMicProvisional: 0, totalMicMinted: 0 };
  }
}

function buildAuthority(payload: Awaited<ReturnType<typeof computeIntegrityPayload>>, _renderEnabled: boolean, renderUsed: boolean) {
  const note =
    payload.source === 'kv'
      ? 'Primary GI is being served from KV-backed state.'
      : payload.source === 'live'
        ? 'GI is being computed from live in-process signals.'
        : 'GI is operating under degraded signal authority.';

  return {
    kv_backed: Boolean(payload.kv),
    gi_origin: renderUsed ? 'gic-indexer' : payload.source,
    note,
  };
}

const CACHE_HEADERS = {
  // C-354: public edge cache — 120s s-maxage reduces KV reads from heartbeat polling.
  // GI changes only on cron ticks (5-10 min); 2 min CDN cache is safe.
  'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=30',
  'X-Mobius-Source': 'integrity-status',
};

export async function GET() {
  // Serve from KV cache when available — avoids Render GIC call on every page init.
  try {
    const cached = await kvGet<Record<string, unknown>>(INTEGRITY_CACHE_KEY);
    if (cached) {
      return NextResponse.json({ ...cached, _cache: 'hit' }, { headers: { ...CACHE_HEADERS, 'X-Cache': 'HIT' } });
    }
  } catch {
    // non-fatal — fall through to live compute
  }

  const payload = await computeIntegrityPayload();
  const micRaw = await loadMicReadinessSnapshotRaw();
  const chain = await resolveGiChain({ micReadinessSnapshotRaw: micRaw.raw });
  const mergedPayload = {
    ...payload,
    ...(chain.gi !== null
      ? {
          global_integrity: chain.gi,
          mode: (chain.mode as typeof payload.mode) ?? payload.mode,
          terminal_status: (chain.terminal_status as typeof payload.terminal_status) ?? payload.terminal_status,
          timestamp: chain.timestamp ?? payload.timestamp,
        }
      : {}),
    gi_provenance: chain.source,
    // gi_verified omitted from public surface — verification state is operator-only
    gi_degraded: chain.degraded,
    gi_age_seconds: chain.age_seconds,
    mic_readiness_snapshot_source: micRaw.source,
  };
  const renderGicUrl = process.env.RENDER_GIC_URL;

  // Resolve MIC totals once for all branches (Fix 4: async KV fallback)
  const mic = await echoMicProvisional();

  async function cacheAndReturn(result: Record<string, unknown>): Promise<NextResponse> {
    // Only cache non-degraded results — a transient Render GIC 5xx/timeout should not
    // be served as a 60s cache HIT to all clients after the upstream recovers.
    if (!result.degraded) {
      kvSet(INTEGRITY_CACHE_KEY, result, INTEGRITY_CACHE_TTL).catch(() => {});
    }
    return NextResponse.json(result, { headers: { ...CACHE_HEADERS, 'X-Cache': 'MISS' } });
  }

  if (!renderGicUrl) {
    return cacheAndReturn({
      ok: true as const,
      degraded: true,
      ...mergedPayload,
      ...mic,
      authority: buildAuthority(payload, false, false),
    });
  }

  try {
    const response = await fetch(`${renderGicUrl}/compute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        signals: mergedPayload.signals,
        cycle: mergedPayload.cycle,
      }),
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    });

    if (!response.ok) {
      console.error(`[render:gic] ${response.status} ${response.statusText}`);
      return cacheAndReturn({
        ok: true as const,
        degraded: true,
        ...mergedPayload,
        ...mic,
        authority: buildAuthority(payload, true, false),
      });
    }

    const remote = (await response.json()) as {
      global_integrity?: number;
      gi?: number;
      mode?: 'green' | 'yellow' | 'red';
      summary?: string;
    };

    const computedGi =
      typeof remote.global_integrity === 'number'
        ? remote.global_integrity
        : typeof remote.gi === 'number'
          ? remote.gi
          : mergedPayload.global_integrity;

    return cacheAndReturn({
      ok: true as const,
      ...mergedPayload,
      ...mic,
      global_integrity: computedGi,
      mode: remote.mode ?? mergedPayload.mode,
      summary: remote.summary ?? mergedPayload.summary,
      source: 'gic-indexer',
      degraded: false,
      authority: buildAuthority(payload, true, true),
    });
  } catch (error) {
    console.error('[render:gic] request failed', error);
    return cacheAndReturn({
      ok: true as const,
      degraded: true,
      ...mergedPayload,
      ...mic,
      authority: buildAuthority(payload, true, false),
    });
  }
}
