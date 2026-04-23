import { NextResponse } from 'next/server';
import { GET as getSnapshotLite } from '@/app/api/terminal/snapshot-lite/route';
import { getHeartbeat, getJournalHeartbeat } from '@/lib/runtime/heartbeat';

export const dynamic = 'force-dynamic';

export async function GET() {
  const now = new Date().toISOString();
  try {
    const res = await getSnapshotLite(new Request('http://localhost/api/terminal/snapshot-lite') as never);
    const lite = (await res.json()) as { degraded?: boolean; lanes?: Record<string, unknown> };
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
      reason: 'lane diagnostics unavailable',
      timestamp: now,
    });
  }
}
