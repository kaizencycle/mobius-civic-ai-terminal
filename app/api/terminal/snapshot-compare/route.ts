import { NextRequest, NextResponse } from 'next/server';
import { GET as getLegacySnapshot } from '@/app/api/terminal/snapshot/route';
import { buildTerminalDalSnapshot } from '@/lib/dal/snapshot';

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

function safeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

/**
 * C-303 Phase 1C — legacy snapshot vs DAL snapshot comparison.
 *
 * Diagnostic only. Does not replace either path.
 */
export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const baseUrl = request.nextUrl.origin;
  const legacyRequest = new NextRequest(new URL('/api/terminal/snapshot', baseUrl));

  const [legacyResponse, dalResult] = await Promise.all([
    getLegacySnapshot(legacyRequest),
    buildTerminalDalSnapshot('C-303'),
  ]);

  const legacyPayload = await legacyResponse.json().catch(() => null);
  const legacy = safeRecord(legacyPayload);
  const dal = dalResult.data;

  const comparisons: CompareField[] = [
    compareField('cycle', legacy.cycle, dal?.cycle),
    compareField('degraded', legacy.degraded, dal?.degraded),
    compareField('vault_ok', safeRecord(legacy.vault).ok, dal?.vault.ok),
  ];

  const mismatchCount = comparisons.filter((item) => item.status === 'mismatch').length;
  const missingCount = comparisons.filter((item) => item.status === 'missing').length;
  const unknownCount = comparisons.filter((item) => item.status === 'unknown').length;

  return NextResponse.json(
    {
      ok: legacyResponse.ok && dalResult.ok,
      mode: 'snapshot-compare',
      migration_state: 'diagnostic_not_authoritative',
      summary: {
        fields_checked: comparisons.length,
        mismatches: mismatchCount,
        missing: missingCount,
        unknown: unknownCount,
        safe_to_cutover: mismatchCount === 0 && missingCount === 0 && dalResult.ok,
      },
      comparisons,
      legacy: {
        ok: legacy.ok ?? legacyResponse.ok,
        degraded: legacy.degraded ?? null,
        cycle: legacy.cycle ?? null,
        terminal_status: legacy.terminal_status ?? null,
      },
      dal: {
        ok: dalResult.ok,
        degraded: dalResult.degraded ?? !dalResult.ok,
        cycle: dal?.cycle ?? null,
        provenance: dalResult.provenance,
        error: dalResult.error ?? null,
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
