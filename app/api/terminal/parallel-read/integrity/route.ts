import { NextResponse } from 'next/server';
import { computeIntegrityPayload } from '@/lib/integrity/buildStatus';
import { readIntegrityDalSnapshot } from '@/lib/dal/integrity';

export const dynamic = 'force-dynamic';

type ParallelReadStatus = 'matched' | 'mismatch' | 'legacy_only' | 'dal_degraded';

function getStatus(
  legacyGi: number,
  dalGi: number | null,
  dalOk: boolean,
  dalDegraded: boolean,
): ParallelReadStatus {
  if (!dalOk || dalDegraded) return 'dal_degraded';
  if (dalGi === null) return 'legacy_only';
  return Math.abs(legacyGi - dalGi) <= 0.001 ? 'matched' : 'mismatch';
}

/**
 * C-303 Phase 2B — Integrity parallel read route.
 *
 * This is not a cutover. Live legacy integrity computation remains authoritative.
 * The DAL read is returned beside it so operators and agents can observe parity.
 */
export async function GET() {
  const startedAt = Date.now();
  const [legacy, dalResult] = await Promise.all([
    computeIntegrityPayload(),
    readIntegrityDalSnapshot(),
  ]);
  const dal = dalResult.data ?? null;
  const dalDegraded = dalResult.degraded ?? !dalResult.ok;
  const status = getStatus(
    legacy.global_integrity,
    dal?.global_integrity ?? null,
    dalResult.ok,
    dalDegraded,
  );

  return NextResponse.json(
    {
      ok: status !== 'mismatch' && status !== 'dal_degraded',
      mode: 'parallel_read_integrity',
      phase: 'C-303 Phase 2B',
      authority: {
        authoritative_source: 'legacy_live_integrity_computation',
        dal_authority: 'shadow_only',
        cutover_enabled: false,
      },
      status,
      legacy: {
        cycle: legacy.cycle,
        global_integrity: legacy.global_integrity,
        mode: legacy.mode,
        terminal_status: legacy.terminal_status,
        source: legacy.source,
        timestamp: legacy.timestamp,
      },
      dal: {
        ok: dalResult.ok,
        degraded: dalDegraded,
        cycle: dal?.cycle ?? null,
        global_integrity: dal?.global_integrity ?? null,
        mode: dal?.mode ?? null,
        terminal_status: dal?.terminal_status ?? null,
        timestamp: dal?.timestamp ?? null,
        provenance: dalResult.provenance,
        error: dalResult.error ?? null,
      },
      parity: {
        cycle_match: dal ? legacy.cycle === dal.cycle : false,
        global_integrity_match: dal ? Math.abs(legacy.global_integrity - dal.global_integrity) <= 0.001 : false,
        mode_match: dal ? legacy.mode === dal.mode : false,
        terminal_status_match: dal ? legacy.terminal_status === dal.terminal_status : false,
      },
      meta: {
        elapsed_ms: Date.now() - startedAt,
        canonical_warning: 'Parallel read only. Live legacy integrity computation remains authoritative.',
      },
    },
    {
      headers: {
        'Cache-Control': 'no-store',
        'X-Mobius-Source': 'terminal-parallel-read-integrity',
      },
    },
  );
}
