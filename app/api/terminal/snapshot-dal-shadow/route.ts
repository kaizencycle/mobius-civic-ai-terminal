import { NextResponse } from 'next/server';
import { buildTerminalDalSnapshot } from '@/lib/dal/snapshot';

export const dynamic = 'force-dynamic';

/**
 * C-303 Phase 1B — DAL shadow mode.
 *
 * This endpoint intentionally does not replace /api/terminal/snapshot.
 * It lets operators compare the new DAL aggregate boundary against the
 * existing terminal snapshot pipeline before any route migration occurs.
 */
export async function GET() {
  const startedAt = Date.now();
  const result = await buildTerminalDalSnapshot('C-303');

  return NextResponse.json(
    {
      ok: result.ok,
      mode: 'dal-shadow',
      migration_state: 'parallel_not_authoritative',
      degraded: result.degraded ?? !result.ok,
      data: result.data,
      provenance: result.provenance,
      error: result.error ?? null,
      meta: {
        elapsed_ms: Date.now() - startedAt,
        canonical_warning: 'This shadow endpoint is diagnostic only and does not replace /api/terminal/snapshot yet.',
      },
    },
    {
      headers: {
        'Cache-Control': 'no-store',
        'X-Mobius-Source': 'terminal-snapshot-dal-shadow',
      },
    },
  );
}
