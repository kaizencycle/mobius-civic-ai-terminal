import { NextResponse } from 'next/server';
import { resolveGiForTerminal } from '@/lib/integrity/resolveGi';
import { loadMicReadinessSnapshotRaw } from '@/lib/mic/loadReadinessSnapshot';
import { currentCycleId } from '@/lib/eve/cycle-engine';
import { loadTripwireState } from '@/lib/kv/store';
import { getHeartbeat, getJournalHeartbeat } from '@/lib/runtime/heartbeat';

export const dynamic = 'force-dynamic';

export async function GET() {
  const timestamp = new Date().toISOString();

  try {
    const [micRaw, gi, tripwire] = await Promise.all([
      loadMicReadinessSnapshotRaw(),
      loadMicReadinessSnapshotRaw().then((row) => resolveGiForTerminal({ micReadinessSnapshotRaw: row.raw })),
      loadTripwireState(),
    ]);

    const mode = typeof gi.mode === 'string' ? gi.mode : null;
    const degraded = Boolean(gi.degraded || mode === 'red' || tripwire?.elevated);

    return NextResponse.json({
      ok: true,
      fallback: false,
      cycle: currentCycleId(),
      gi: gi.gi,
      mode,
      degraded,
      tripwire: {
        count: tripwire?.tripwireCount ?? 0,
        elevated: tripwire?.elevated ?? false,
      },
      heartbeat: {
        runtime: getHeartbeat(),
        journal: getJournalHeartbeat(),
      },
      source: micRaw.source === 'none' ? 'fallback' : 'live',
      timestamp,
    });
  } catch {
    return NextResponse.json({
      ok: true,
      fallback: true,
      cycle: currentCycleId(),
      gi: null,
      mode: 'yellow',
      degraded: true,
      tripwire: { count: 0, elevated: false },
      heartbeat: {
        runtime: getHeartbeat(),
        journal: getJournalHeartbeat(),
      },
      source: 'fallback',
      timestamp,
    });
  }
}
