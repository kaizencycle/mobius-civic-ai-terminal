import { NextResponse } from 'next/server';
import { GET as getSnapshotLite } from '@/app/api/terminal/snapshot-lite/route';
import { getHeartbeat, getJournalHeartbeat } from '@/lib/runtime/heartbeat';
import { readTerminalWatermark } from '@/lib/terminal/watermark';
import { getJournalRedisClient } from '@/lib/agents/journalLane';

export const dynamic = 'force-dynamic';

export async function GET() {
  const now = new Date().toISOString();
  // C-292: read watermark in parallel with snapshot-lite so the lane diagnostics
  // panel can surface journal/ledger lane write recency from KV.
  const [liteRes, watermarkResult] = await Promise.allSettled([
    getSnapshotLite(new Request('http://localhost/api/terminal/snapshot-lite') as never),
    readTerminalWatermark(getJournalRedisClient()),
  ]);

  const lite = liteRes.status === 'fulfilled'
    ? ((await liteRes.value.json().catch(() => ({}))) as { degraded?: boolean; lanes?: Record<string, unknown> })
    : { degraded: true, lanes: {} };
  const wm = watermarkResult.status === 'fulfilled' ? watermarkResult.value : null;

  try {
    const tripwireLane = (lite.lanes?.tripwire as { count?: number; elevated?: boolean } | undefined) ?? {};
    return NextResponse.json({
      ok: true,
      degraded: Boolean(lite.degraded),
      lanes: lite.lanes ?? {},
      tripwire: {
        count: tripwireLane.count ?? 0,
        elevated: Boolean(tripwireLane.elevated),
      },
      heartbeat: {
        runtime: getHeartbeat(),
        journal: getJournalHeartbeat(),
      },
      watermark: wm
        ? {
            version: wm.version,
            cycle: wm.cycle ?? null,
            updatedAt: wm.updatedAt,
            journal: wm.lanes.journal ?? null,
            ledger: wm.lanes.ledger ?? null,
            snapshot: wm.lanes.snapshot ?? null,
            signals: wm.lanes.signals ?? null,
          }
        : null,
      reason: lite.degraded ? 'one or more lanes degraded' : null,
      timestamp: now,
    });
  } catch {
    return NextResponse.json({
      ok: true,
      degraded: true,
      lanes: {},
      tripwire: { count: 0, elevated: false },
      heartbeat: { runtime: getHeartbeat(), journal: getJournalHeartbeat() },
      watermark: null,
      reason: 'lane diagnostics unavailable',
      timestamp: now,
    });
  }
}
