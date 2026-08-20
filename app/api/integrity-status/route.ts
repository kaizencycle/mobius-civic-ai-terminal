import { NextResponse } from 'next/server';
import { computeIntegrityPayload } from '@/lib/integrity/buildStatus';
import { buildIntegrityEnrichment } from '@/lib/integrity/buildIntegrityEnrichment';
import { countDegradedAgentsFromSignalSnapshot } from '@/lib/integrity/agentDegradationCount';
import {
  buildIntegrityAuthorityBlock,
  resolveIntegrityDegraded,
} from '@/lib/integrity/integrityAuthority';
import { resolveGiChain } from '@/lib/gi/resolveGiChain';
import { loadMicReadinessSnapshotRaw } from '@/lib/mic/loadReadinessSnapshot';
import { assessKvKeyHealth } from '@/lib/kv/kvKeyHealth';
import { getTripwireState } from '@/lib/tripwire/store';
import { kvGet, kvSet } from '@/lib/kv/store';
import {
  loadLatestZeusVerificationReport,
  mapZeusVerificationStatus,
  zeusGovernanceStateFromReport,
} from '@/lib/integrity/zeusCatalog';
import { deriveQuorumAuthoritySemantics } from '@/lib/mic/quorumSemantics';
import { loadQuorumState } from '@/lib/mic/quorumTracker';
import { currentCycleId } from '@/lib/eve/cycle-engine';
import { getGiMode } from '@/lib/gi/mode';

// OPT-07 (C-312): integrity-status is called on every page init and hits Render GIC
// on every request. GI changes only on cron ticks (5-10min). 60s KV cache reduces
// Render GIC load by ~95% at typical page-load rates.
const INTEGRITY_CACHE_KEY = 'cache:integrity-status';
const INTEGRITY_CACHE_TTL = 60;

export const dynamic = 'force-dynamic';

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
  const latestZeus = loadLatestZeusVerificationReport();
  const zeusVerificationStatus = mapZeusVerificationStatus(latestZeus?.report.verification_status);
  const zeusGovernanceState = zeusGovernanceStateFromReport(latestZeus?.report);
  const quorumState = await loadQuorumState(currentCycleId());
  const quorumSemantics = deriveQuorumAuthoritySemantics(quorumState, {
    verification_status: zeusVerificationStatus,
    candidates_reviewed: latestZeus?.report.candidates_reviewed ?? 0,
    tripwire_active: tripwire.active,
  });

  function tripwireElevated(): boolean {
    if (!tripwire.active) return false;
    return (
      tripwire.level === 'elevated' ||
      tripwire.level === 'high' ||
      tripwire.level === 'triggered' ||
      tripwire.level === 'suspended'
    );
  }

  function resolveResponseDegraded(args: {
    giDegraded: boolean;
    gicAvailable: boolean;
    gicFetchFailed?: boolean;
    upstreamDegraded?: boolean;
  }): boolean {
    return resolveIntegrityDegraded({
      giDegraded: args.giDegraded,
      kvOk: Boolean(payload.kv),
      integrityLaneOk: chainGi !== null && Number.isFinite(chainGi),
      mode: chainGi !== null && Number.isFinite(chainGi) ? getGiMode(chainGi) : null,
      tripwireElevated: tripwireElevated(),
      gicAvailable: args.gicAvailable,
      gicFetchFailed: args.gicFetchFailed,
      zeusVerificationStatus,
      governanceState: zeusGovernanceState,
      upstreamDegraded: args.upstreamDegraded,
    });
  }

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
      zeusGovernanceState,
    });

    const authority = buildIntegrityAuthorityBlock({
      persistenceSource: args.persistenceSource,
      kvBacked: Boolean(payload.kv),
      renderUsed: args.renderUsed,
      gicAvailable: Boolean(renderGicUrl),
      zeusVerificationStatus,
      degraded: args.responseDegraded,
    });

    return {
      ok: true as const,
      degraded: args.responseDegraded,
      execution_authorized: false as const,
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
      authority,
      zeus_verification: latestZeus
        ? {
            path: latestZeus.relative_path,
            status: latestZeus.report.verification_status ?? 'unknown',
            timestamp: latestZeus.report.timestamp,
            candidates_reviewed: latestZeus.report.candidates_reviewed ?? 0,
          }
        : null,
      quorum_semantics: quorumSemantics,
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
        responseDegraded: resolveResponseDegraded({
          giDegraded: chain.degraded,
          gicAvailable: false,
        }),
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
          responseDegraded: resolveResponseDegraded({
            giDegraded: chain.degraded,
            gicAvailable: true,
            gicFetchFailed: true,
          }),
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
        responseDegraded: resolveResponseDegraded({
          giDegraded: false,
          gicAvailable: true,
        }),
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
        responseDegraded: resolveResponseDegraded({
          giDegraded: chain.degraded,
          gicAvailable: true,
          gicFetchFailed: true,
        }),
      }),
    );
  }
}
