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
    // OPT-1 (C-291): loadMicReadinessSnapshotRaw was called twice in parallel —
    // once for the raw source label and once piped into resolveGiForTerminal.
    // Call it once, then pass the result to both consumers.
    const [micRaw, tripwire] = await Promise.all([
      loadMicReadinessSnapshotRaw(),
      loadTripwireState(),
    ]);

    const gi = await resolveGiForTerminal({ micReadinessSnapshotRaw: micRaw.raw });

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
    }, {
      headers: {
        // FIX-507-07: extended stale-while-revalidate so CDN doesn't flood background
        // revalidation calls on every STALE hit. Serve cached for 30s, allow background
        // revalidate for 2min. GI/tripwire state changes on cron cadence (~60-300s).
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120',
      },
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
