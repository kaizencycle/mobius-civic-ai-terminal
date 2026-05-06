import { NextRequest, NextResponse } from 'next/server';
import { GET as getLegacySnapshot } from '@/app/api/terminal/snapshot/route';
import { buildTerminalDalSnapshot } from '@/lib/dal/snapshot';
import { readIntegrityDalSnapshot } from '@/lib/dal/integrity';
import { readTripwireDalSnapshot } from '@/lib/dal/tripwire';
import type { DalResult } from '@/lib/dal/types';

type CompareStatus = 'match' | 'mismatch' | 'missing' | 'unknown';

type CompareField = {
  field: string;
  status: CompareStatus;
  legacy: unknown;
  dal: unknown;
};

type ConfidenceInput = {
  comparisons: CompareField[];
  dalResults: Array<DalResult<unknown>>;
};

type CompareHistoryFrame = {
  id: string;
  ts: string;
  mode: 'snapshot-compare';
  migration_state: 'diagnostic_not_authoritative';
  confidence_score: number;
  parity_ratio: number;
  mismatches: number;
  missing: number;
  unknown: number;
  fallback_count: number;
  stale_count: number;
  cutover_recommendation: string;
};

export const dynamic = 'force-dynamic';

function compareField(field: string, legacy: unknown, dal: unknown): CompareField {
  if (legacy === undefined || dal === undefined) {
    return { field, status: 'missing', legacy, dal };
  }

  if (legacy === null || dal === null) {
    return { field, status: legacy === dal ? 'match' : 'unknown', legacy, dal };
  }

  return { field, status: legacy === dal ? 'match' : 'mismatch', legacy, dal };
}

function compareNumberField(field: string, legacy: unknown, dal: unknown, tolerance = 0.001): CompareField {
  if (legacy === undefined || dal === undefined) {
    return { field, status: 'missing', legacy, dal };
  }

  if (typeof legacy !== 'number' || typeof dal !== 'number') {
    return { field, status: 'unknown', legacy, dal };
  }

  return {
    field,
    status: Math.abs(legacy - dal) <= tolerance ? 'match' : 'mismatch',
    legacy,
    dal,
  };
}

function safeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function findLegacyTripwire(legacy: Record<string, unknown>): Record<string, unknown> {
  const direct = safeRecord(legacy.tripwire);
  if (Object.keys(direct).length > 0) return direct;

  const tripwires = safeRecord(legacy.tripwires);
  if (Object.keys(tripwires).length > 0) return tripwires;

  const runtime = safeRecord(legacy.runtime);
  const runtimeTripwire = safeRecord(runtime.tripwire);
  if (Object.keys(runtimeTripwire).length > 0) return runtimeTripwire;

  const sentinel = safeRecord(legacy.sentinel);
  return safeRecord(sentinel.tripwire);
}

function buildConfidenceMetrics({ comparisons, dalResults }: ConfidenceInput) {
  const fieldsChecked = comparisons.length;
  const matches = comparisons.filter((item) => item.status === 'match').length;
  const mismatches = comparisons.filter((item) => item.status === 'mismatch').length;
  const missing = comparisons.filter((item) => item.status === 'missing').length;
  const unknown = comparisons.filter((item) => item.status === 'unknown').length;
  const degradedSources = dalResults
    .filter((result) => result.degraded || !result.ok)
    .map((result) => result.provenance.source);
  const fallbackCount = dalResults.filter((result) => result.provenance.source === 'fallback').length;
  const staleCount = dalResults.filter((result) => result.provenance.freshness !== 'live').length;

  const parityRatio = fieldsChecked > 0 ? matches / fieldsChecked : 0;
  const penalty = (mismatches * 0.2) + (missing * 0.15) + (unknown * 0.05) + (fallbackCount * 0.05) + (staleCount * 0.03);
  const confidenceScore = Math.max(0, Math.min(1, parityRatio - penalty));

  return {
    fields_checked: fieldsChecked,
    matches,
    mismatches,
    missing,
    unknown,
    parity_ratio: Number(parityRatio.toFixed(4)),
    confidence_score: Number(confidenceScore.toFixed(4)),
    degraded_sources: [...new Set(degradedSources)],
    fallback_count: fallbackCount,
    stale_count: staleCount,
    cutover_recommendation:
      confidenceScore >= 0.98 && mismatches === 0 && missing === 0 && fallbackCount === 0
        ? 'eligible_for_limited_shadow_cutover'
        : confidenceScore >= 0.85 && mismatches === 0
          ? 'continue_shadow_observation'
          : 'not_ready_for_cutover',
  };
}

function buildHistoryFrame(confidence: ReturnType<typeof buildConfidenceMetrics>): CompareHistoryFrame {
  const ts = new Date().toISOString();
  return {
    id: `snapshot-compare-${ts}`,
    ts,
    mode: 'snapshot-compare',
    migration_state: 'diagnostic_not_authoritative',
    confidence_score: confidence.confidence_score,
    parity_ratio: confidence.parity_ratio,
    mismatches: confidence.mismatches,
    missing: confidence.missing,
    unknown: confidence.unknown,
    fallback_count: confidence.fallback_count,
    stale_count: confidence.stale_count,
    cutover_recommendation: confidence.cutover_recommendation,
  };
}

/**
 * C-303 Phase 1H — legacy snapshot vs DAL snapshot comparison.
 *
 * Diagnostic only. Does not replace either path.
 */
export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const baseUrl = request.nextUrl.origin;
  const legacyRequest = new NextRequest(new URL('/api/terminal/snapshot', baseUrl));

  const [legacyResponse, dalResult, integrityDalResult, tripwireDalResult] = await Promise.all([
    getLegacySnapshot(legacyRequest),
    buildTerminalDalSnapshot('C-303'),
    readIntegrityDalSnapshot(),
    readTripwireDalSnapshot(),
  ]);

  const legacyPayload = await legacyResponse.json().catch(() => null);
  const legacy = safeRecord(legacyPayload);
  const legacyGi = safeRecord(legacy.gi);
  const legacyIntegrity = safeRecord(legacy.integrity);
  const legacyTripwire = findLegacyTripwire(legacy);
  const dal = dalResult.data;
  const integrityDal = integrityDalResult.data;
  const tripwireDal = tripwireDalResult.data;

  const legacyGlobalIntegrity =
    typeof legacy.global_integrity === 'number'
      ? legacy.global_integrity
      : typeof legacyGi.score === 'number'
        ? legacyGi.score
        : typeof legacyIntegrity.global_integrity === 'number'
          ? legacyIntegrity.global_integrity
          : undefined;

  const legacyTripwireActive =
    typeof legacyTripwire.active === 'boolean'
      ? legacyTripwire.active
      : typeof legacyTripwire.triggered === 'boolean'
        ? legacyTripwire.triggered
        : undefined;

  const comparisons: CompareField[] = [
    compareField('cycle', legacy.cycle, dal?.cycle),
    compareField('degraded', legacy.degraded, dal?.degraded),
    compareField('vault_ok', safeRecord(legacy.vault).ok, dal?.vault.ok),
    compareField('integrity_cycle', legacy.cycle, integrityDal?.cycle),
    compareNumberField('global_integrity', legacyGlobalIntegrity, integrityDal?.global_integrity),
    compareField('terminal_status', legacy.terminal_status, integrityDal?.terminal_status),
    compareField('tripwire_active', legacyTripwireActive, tripwireDal?.active),
    compareField('tripwire_level', legacyTripwire.level, tripwireDal?.level),
    compareField('tripwire_triggered_by', legacyTripwire.triggered_by ?? legacyTripwire.triggeredBy, tripwireDal?.triggered_by),
  ];

  const confidence = buildConfidenceMetrics({
    comparisons,
    dalResults: [dalResult, integrityDalResult, tripwireDalResult] as Array<DalResult<unknown>>,
  });
  const historyFrame = buildHistoryFrame(confidence);

  return NextResponse.json(
    {
      ok: legacyResponse.ok && dalResult.ok && integrityDalResult.ok && tripwireDalResult.ok,
      mode: 'snapshot-compare',
      migration_state: 'diagnostic_not_authoritative',
      summary: {
        ...confidence,
        safe_to_cutover:
          confidence.mismatches === 0 &&
          confidence.missing === 0 &&
          confidence.fallback_count === 0 &&
          confidence.confidence_score >= 0.98 &&
          dalResult.ok &&
          integrityDalResult.ok &&
          tripwireDalResult.ok,
      },
      history: {
        frame: historyFrame,
        persistence: 'not_enabled',
        note: 'Phase 1H exposes a stable history frame. Persistence should be added after KV wrapper selection.',
      },
      comparisons,
      legacy: {
        ok: legacy.ok ?? legacyResponse.ok,
        degraded: legacy.degraded ?? null,
        cycle: legacy.cycle ?? null,
        terminal_status: legacy.terminal_status ?? null,
        global_integrity: legacyGlobalIntegrity ?? null,
        tripwire: {
          active: legacyTripwireActive ?? null,
          level: legacyTripwire.level ?? null,
          triggered_by: legacyTripwire.triggered_by ?? legacyTripwire.triggeredBy ?? null,
        },
      },
      dal: {
        ok: dalResult.ok,
        degraded: dalResult.degraded ?? !dalResult.ok,
        cycle: dal?.cycle ?? null,
        provenance: dalResult.provenance,
        error: dalResult.error ?? null,
        integrity: {
          ok: integrityDalResult.ok,
          cycle: integrityDal?.cycle ?? null,
          global_integrity: integrityDal?.global_integrity ?? null,
          terminal_status: integrityDal?.terminal_status ?? null,
          provenance: integrityDalResult.provenance,
          error: integrityDalResult.error ?? null,
        },
        tripwire: {
          ok: tripwireDalResult.ok,
          active: tripwireDal?.active ?? null,
          level: tripwireDal?.level ?? null,
          triggered_by: tripwireDal?.triggered_by ?? null,
          provenance: tripwireDalResult.provenance,
          error: tripwireDalResult.error ?? null,
        },
      },
      meta: {
        elapsed_ms: Date.now() - startedAt,
        canonical_warning: 'Comparison is diagnostic only. Legacy snapshot remains authoritative.',
      },
    },
    {
      headers: {
        'Cache-Control': 'no-store',
        'X-Mobius-Source': 'terminal-snapshot-compare',
      },
    },
  );
}
