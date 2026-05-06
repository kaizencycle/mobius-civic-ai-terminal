import { NextRequest, NextResponse } from 'next/server';
import { GET as getLegacySnapshot } from '@/app/api/terminal/snapshot/route';
import { buildTerminalDalSnapshot } from '@/lib/dal/snapshot';
import { readIntegrityDalSnapshot } from '@/lib/dal/integrity';
import { readTripwireDalSnapshot } from '@/lib/dal/tripwire';

type CompareStatus = 'match' | 'mismatch' | 'missing' | 'unknown';

type CompareField = {
  field: string;
  status: CompareStatus;
  legacy: unknown;
  dal: unknown;
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

/**
 * C-303 Phase 1F — legacy snapshot vs DAL snapshot comparison.
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

  const mismatchCount = comparisons.filter((item) => item.status === 'mismatch').length;
  const missingCount = comparisons.filter((item) => item.status === 'missing').length;
  const unknownCount = comparisons.filter((item) => item.status === 'unknown').length;

  return NextResponse.json(
    {
      ok: legacyResponse.ok && dalResult.ok && integrityDalResult.ok && tripwireDalResult.ok,
      mode: 'snapshot-compare',
      migration_state: 'diagnostic_not_authoritative',
      summary: {
        fields_checked: comparisons.length,
        mismatches: mismatchCount,
        missing: missingCount,
        unknown: unknownCount,
        safe_to_cutover:
          mismatchCount === 0 &&
          missingCount === 0 &&
          dalResult.ok &&
          integrityDalResult.ok &&
          tripwireDalResult.ok,
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
