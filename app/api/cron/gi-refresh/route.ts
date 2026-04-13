/**
 * GET /api/cron/gi-refresh — refresh GI_STATE in KV every 30m (Vercel cron).
 * Runs signal engine for fresh ECHO-backed scores, then recomputes GI.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getEveSynthesisAuthError } from '@/lib/security/serviceAuth';
import { runSignalEngine } from '@/lib/signals/engine';
import { recomputeAndSaveGIState } from '@/lib/integrity/buildStatus';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authErr = getEveSynthesisAuthError(request);
  if (authErr) return authErr;

  try {
    await runSignalEngine();
    const giState = await recomputeAndSaveGIState();
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
