import { NextResponse } from 'next/server';
import { readTripwireDalSnapshot } from '@/lib/dal/tripwire';
import { getTripwireState } from '@/lib/tripwire/store';

export const dynamic = 'force-dynamic';

type ParallelReadStatus = 'matched' | 'mismatch' | 'legacy_only' | 'dal_degraded';

function getStatus(legacyActive: boolean, dalActive: boolean | null, dalOk: boolean): ParallelReadStatus {
  if (!dalOk) return 'dal_degraded';
  if (dalActive === null) return 'legacy_only';
  return legacyActive === dalActive ? 'matched' : 'mismatch';
}

/**
 * C-303 Phase 2A — Tripwire parallel read route.
 *
 * This is not a cutover. Legacy runtime tripwire state remains authoritative.
 * The DAL read is returned beside it so operators and agents can observe parity.
 */
export async function GET() {
  const startedAt = Date.now();
  const legacy = getTripwireState();
  const dalResult = await readTripwireDalSnapshot();
  const dal = dalResult.data ?? null;
  const status = getStatus(legacy.active, dal?.active ?? null, dalResult.ok);

  return NextResponse.json(
    {
      ok: status !== 'mismatch' && status !== 'dal_degraded',
      mode: 'parallel_read_tripwire',
      phase: 'C-303 Phase 2A',
      authority: {
        authoritative_source: 'legacy_runtime_tripwire_store',
        dal_authority: 'shadow_only',
        cutover_enabled: false,
      },
      status,
      legacy: {
        active: legacy.active,
        level: legacy.level,
        reason: legacy.reason,
        last_updated: legacy.last_updated,
        triggered_by: legacy.triggeredBy ?? null,
      },
      dal: {
        ok: dalResult.ok,
        degraded: dalResult.degraded ?? !dalResult.ok,
        active: dal?.active ?? null,
        level: dal?.level ?? null,
        reason: dal?.reason ?? null,
        last_updated: dal?.last_updated ?? null,
        triggered_by: dal?.triggered_by ?? null,
        provenance: dalResult.provenance,
        error: dalResult.error ?? null,
      },
      parity: {
        active_match: dal ? legacy.active === dal.active : false,
        level_match: dal ? legacy.level === dal.level : false,
        triggered_by_match: dal ? (legacy.triggeredBy ?? null) === dal.triggered_by : false,
      },
      meta: {
        elapsed_ms: Date.now() - startedAt,
        canonical_warning: 'Parallel read only. Legacy tripwire state remains authoritative.',
      },
    },
    {
      headers: {
        'Cache-Control': 'no-store',
        'X-Mobius-Source': 'terminal-parallel-read-tripwire',
      },
    },
  );
}
