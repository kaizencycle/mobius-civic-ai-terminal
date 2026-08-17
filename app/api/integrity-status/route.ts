import { NextResponse } from 'next/server';
import { computeIntegrityPayload } from '@/lib/integrity/buildStatus';
import { buildIntegrityEnrichment } from '@/lib/integrity/buildIntegrityEnrichment';
import { countDegradedAgentsFromSignalSnapshot } from '@/lib/integrity/agentDegradationCount';
import { resolveGiChain } from '@/lib/gi/resolveGiChain';
import { loadMicReadinessSnapshotRaw } from '@/lib/mic/loadReadinessSnapshot';
import { assessKvKeyHealth } from '@/lib/kv/kvKeyHealth';
import { getTripwireState } from '@/lib/tripwire/store';
import { kvGet, kvSet } from '@/lib/kv/store';

// OPT-07 (C-312): integrity-status is called on every page init and hits Render GIC
// on every request. GI changes only on cron ticks (5-10min). 60s KV cache reduces
// Render GIC load by ~95% at typical page-load rates.
const INTEGRITY_CACHE_KEY = 'cache:integrity-status';
const INTEGRITY_CACHE_TTL = 60;

export const dynamic = 'force-dynamic';

function buildAuthority(
  persistenceSource: string,
  kvBacked: boolean,
  renderUsed: boolean,
) {
  const note =
    persistenceSource === 'kv'
      ? 'Primary GI is being served from KV-backed state.'
      : persistenceSource === 'live'
        ? 'GI is being computed from live in-process signals.'
        : persistenceSource === 'gic-indexer'
          ? 'GI is being served from Render GIC indexer.'
          : 'GI is operating under degraded signal authority.';

  return {
    kv_backed: kvBacked,
    gi_origin: renderUsed ? 'gic-indexer' : persistenceSource,
    note,
  };
}

const CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=30',
  'X-Mobius-Source': 'integrity-status',
};

export async function GET() {
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
  const chainGi = chain.gi !== null ? chain.gi : payload.global_integrity;

  const [kvKeyHealth, tripwire, degradedAgentCount] = await Promise.all([
    assessKvKeyHealth().catch(() => null),
    Promise.resolve(getTripwireState()),
    countDegradedAgentsFromSignalSnapshot().catch(() => null),
  ]);

  const renderGicUrl = process.env.RENDER_GIC_URL;

  async function cacheAndReturn(result: Record<string, unknown>): Promise<NextResponse> {
    if (!result.degraded) {
      kvSet(INTEGRITY_CACHE_KEY, result, INTEGRITY_CACHE_TTL).catch(() => {});
    }
    return NextResponse.json(result, { headers: { ...CACHE_HEADERS, 'X-Cache': 'MISS' } });
  }

  function assembleResponse(args: {
    finalGi: number;
    computationSource: string;
    persistenceSource: string;
    giDegraded: boolean;
    rawIntegrity?: number | null;
    giFloored?: boolean;
    summary?: string;
    renderUsed: boolean;
    responseDegraded: boolean;
    computedAt?: string | null;
    cacheAgeSeconds?: number | null;
  }) {
    const enrichment = buildIntegrityEnrichment({
      finalGi: args.finalGi,
      computationSource: args.computationSource,
      persistenceSource: args.persistenceSource,
      chain,
      payload,
      kvKeyHealth,
      tripwire,
      degradedAgentCount,
      giDegraded: args.giDegraded,
      storedMode: payload.mode,
      computedAt: args.computedAt,
      cacheAgeSeconds: args.cacheAgeSeconds,
    });

    return {
      ok: true as const,
      degraded: args.responseDegraded,
      ...payload,
      global_integrity: enrichment.global_integrity,
      raw_integrity: args.rawIntegrity ?? chain.raw_integrity ?? payload.raw_integrity,
      gi_floored: args.giFloored ?? chain.gi_floored ?? payload.gi_floored,
      mode: enrichment.mode,
      terminal_status: enrichment.terminal_status,
      timestamp: chain.timestamp ?? payload.timestamp,
      summary: args.summary ?? payload.summary,
      source: args.persistenceSource,
      gi_provenance: enrichment.gi_provenance,
      gi_representation: enrichment.gi_representation,
      decision_state: enrichment.decision_state,
      kv_continuity_ok: enrichment.kv_continuity_ok,
      gi_degraded: enrichment.gi_degraded,
      gi_age_seconds: enrichment.gi_age_seconds,
      mic_readiness_snapshot_source: micRaw.source,
      authority: buildAuthority(args.persistenceSource, Boolean(payload.kv), args.renderUsed),
    };
  }

  if (!renderGicUrl) {
    return cacheAndReturn(
      assembleResponse({
        finalGi: chainGi,
        computationSource: chain.source,
        persistenceSource: payload.source,
        giDegraded: chain.degraded,
        renderUsed: false,
        responseDegraded: true,
      }),
    );
  }

  const baseSignals = {
    ...payload.signals,
  };

  try {
    const response = await fetch(`${renderGicUrl}/compute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        signals: baseSignals,
        cycle: payload.cycle,
      }),
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    });

    if (!response.ok) {
      console.error(`[render:gic] ${response.status} ${response.statusText}`);
      return cacheAndReturn(
        assembleResponse({
          finalGi: chainGi,
          computationSource: chain.source,
          persistenceSource: payload.source,
          giDegraded: chain.degraded,
          renderUsed: true,
          responseDegraded: true,
        }),
      );
    }

    const remote = (await response.json()) as {
      global_integrity?: number;
      gi?: number;
      summary?: string;
    };

    const computedGi =
      typeof remote.global_integrity === 'number'
        ? remote.global_integrity
        : typeof remote.gi === 'number'
          ? remote.gi
          : chainGi;

    const gicComputedAt = new Date().toISOString();

    return cacheAndReturn(
      assembleResponse({
        finalGi: computedGi,
        computationSource: 'gic-indexer',
        persistenceSource: 'gic-indexer',
        giDegraded: false,
        rawIntegrity: null,
        giFloored: false,
        summary: remote.summary ?? payload.summary,
        renderUsed: true,
        responseDegraded: false,
        computedAt: gicComputedAt,
        cacheAgeSeconds: 0,
      }),
    );
  } catch (error) {
    console.error('[render:gic] request failed', error);
    return cacheAndReturn(
      assembleResponse({
        finalGi: chainGi,
        computationSource: chain.source,
        persistenceSource: payload.source,
        giDegraded: chain.degraded,
        renderUsed: true,
        responseDegraded: true,
      }),
    );
  }
}
