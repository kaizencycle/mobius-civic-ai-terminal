import { type NextRequest, NextResponse } from 'next/server';
import { readTerminalWatermark } from '@/lib/terminal/watermark';
import { getJournalRedisClient } from '@/lib/agents/journalLane';
import { getServiceAuthError } from '@/lib/security/serviceAuth';

export const dynamic = 'force-dynamic';

// C-292: operator endpoint for diagnosing journal/ledger lane flow stoppages.
// Returns full terminal:watermark KV state with per-lane age in seconds.
// Requires MOBIUS_SERVICE_SECRET or CRON_SECRET Bearer token.
//
// Usage:
//   curl -H "Authorization: Bearer $MOBIUS_SERVICE_SECRET" \
//     https://mobius-civic-ai-terminal.vercel.app/api/debug/watermark
export async function GET(request: NextRequest) {
  const authErr = getServiceAuthError(request);
  if (authErr) return authErr;

  const redis = getJournalRedisClient();
  if (!redis) {
    return NextResponse.json(
      { ok: false, error: 'KV not configured', watermark: null },
      { status: 503 },
    );
  }

  try {
    const watermark = await readTerminalWatermark(redis);
    const now = Date.now();

    const laneAgeSeconds = Object.fromEntries(
      Object.entries(watermark.lanes).map(([lane, lw]) => {
        if (!lw?.updatedAt) return [lane, null];
        const age = Math.floor((now - new Date(lw.updatedAt).getTime()) / 1000);
        return [lane, Number.isFinite(age) ? age : null];
      }),
    );

    return NextResponse.json({
      ok: true,
      watermark,
      lane_age_seconds: laneAgeSeconds,
      diagnostic: {
        journal_last_write: watermark.lanes.journal?.updatedAt ?? null,
        journal_cycle: watermark.cycle ?? null,
        journal_status: watermark.lanes.journal?.status ?? null,
        journal_age_seconds: laneAgeSeconds.journal ?? null,
        ledger_last_write: watermark.lanes.ledger?.updatedAt ?? null,
        signals_last_write: watermark.lanes.signals?.updatedAt ?? null,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'watermark read failed',
        watermark: null,
      },
      { status: 500 },
    );
  }
}
