/**
 * GET /api/cron/gi-refresh — refresh GI_STATE in KV (Vercel cron).
 * Schedule: once daily on Hobby (`45 0 * * *` UTC); Pro can use a sub-daily expression if desired.
 * Runs signal engine for fresh ECHO-backed scores, then recomputes GI.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getEveSynthesisAuthError } from '@/lib/security/serviceAuth';
import { runSignalEngine } from '@/lib/signals/engine';
import { recomputeAndSaveGIState } from '@/lib/integrity/buildStatus';
import { pushLedgerEntry } from '@/lib/epicon/ledgerPush';
import { currentCycleId } from '@/lib/eve/cycle-engine';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authErr = getEveSynthesisAuthError(request);
  if (authErr) return authErr;

  try {
    await runSignalEngine();
    const giState = await recomputeAndSaveGIState();

    if (giState) {
      void pushLedgerEntry({
        id: `gi-refresh-${currentCycleId()}-${Date.now()}`,
        timestamp: new Date().toISOString(),
        author: 'ATLAS',
        title: `GI refresh: ${giState.global_integrity.toFixed(4)} — mode ${giState.mode}`,
        type: 'epicon',
        severity: giState.global_integrity < 0.7 ? 'elevated' : 'nominal',
        source: 'kv-ledger',
        tags: ['gi-refresh', 'integrity', currentCycleId()],
        verified: false,
        category: 'heartbeat',
        status: 'committed',
        agentOrigin: 'ATLAS',
      }).catch(() => {});
    }

    return NextResponse.json({
      ok: true,
      refreshed: giState !== null,
      global_integrity: giState?.global_integrity ?? null,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[cron/gi-refresh] failed:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'gi refresh failed' },
      { status: 500 },
    );
  }
}
