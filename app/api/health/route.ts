import { NextResponse } from 'next/server';
import {
  KV_KEYS,
  kvGet,
  kvHealth,
  loadEchoState,
  loadGIState,
  loadSignalSnapshot,
  loadTripwireState,
} from '@/lib/kv/store';
import { getHeartbeat, getJournalHeartbeat } from '@/lib/runtime/heartbeat';

export const dynamic = 'force-dynamic';

type SystemPulse = {
  ok?: boolean;
  composite?: number;
  cycle?: string;
  instruments?: number;
  anomalies?: number;
  timestamp?: string;
};

function ageSeconds(timestamp: string | null | undefined): number | null {
  if (!timestamp) return null;
  const ms = new Date(timestamp).getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.floor((Date.now() - ms) / 1000));
}

export async function GET() {
  const [kv, gi, signals, echo, tripwire, pulse] = await Promise.all([
    kvHealth(),
    loadGIState(),
    loadSignalSnapshot(),
    loadEchoState(),
    loadTripwireState(),
    kvGet<SystemPulse>(KV_KEYS.SYSTEM_PULSE),
  ]);

  const runtimeHeartbeat = getHeartbeat();
  const journalHeartbeat = getJournalHeartbeat();

  const checks = {
    kv: kv.available,
    gi_state: Boolean(gi),
    signal_snapshot: Boolean(signals),
    echo_state: Boolean(echo),
    tripwire_state: Boolean(tripwire),
    system_pulse: Boolean(pulse?.timestamp),
  };

  const giYellowOrRed = gi?.mode === 'yellow' || gi?.mode === 'red';
  const tripwireElevated = tripwire?.elevated === true;
  const pulseSec = pulse?.timestamp ? Math.max(0, Math.floor((Date.now() - new Date(pulse.timestamp).getTime()) / 1000)) : null;
  const freshnessBreach = pulseSec != null && pulseSec > 1800;

  const degraded =
    !checks.kv || !checks.gi_state || !checks.system_pulse ||
    !checks.echo_state || !checks.signal_snapshot ||
    giYellowOrRed || tripwireElevated || freshnessBreach;

  return NextResponse.json({
    ok: true,
    status: degraded ? 'degraded' : 'operational',
    timestamp: new Date().toISOString(),
    checks,
    kv,
    pulse: pulse?.timestamp
      ? {
          timestamp: pulse.timestamp,
          age_seconds: ageSeconds(pulse.timestamp),
          cycle: pulse.cycle ?? null,
          composite: pulse.composite ?? null,
          instruments: pulse.instruments ?? null,
          anomalies: pulse.anomalies ?? null,
        }
      : null,
    gi: gi
      ? {
          timestamp: gi.timestamp,
          age_seconds: ageSeconds(gi.timestamp),
          source: gi.source,
          mode: gi.mode,
          terminal_status: gi.terminal_status,
        }
      : null,
    echo: echo
      ? {
          timestamp: echo.timestamp,
          age_seconds: ageSeconds(echo.timestamp),
          last_ingest: echo.lastIngest,
          last_ingest_age_seconds: ageSeconds(echo.lastIngest),
          cycle: echo.cycleId,
          total_ingested: echo.totalIngested,
        }
      : null,
    signal_snapshot: signals
      ? {
          timestamp: signals.timestamp,
          age_seconds: ageSeconds(signals.timestamp),
          composite: signals.composite,
          anomalies: signals.anomalies,
          healthy: signals.healthy,
        }
      : null,
    tripwire: tripwire
      ? {
          timestamp: tripwire.timestamp,
          age_seconds: ageSeconds(tripwire.timestamp),
          elevated: tripwire.elevated,
          tripwire_count: tripwire.tripwireCount,
        }
      : null,
    heartbeat: {
      runtime: runtimeHeartbeat,
      runtime_age_seconds: ageSeconds(runtimeHeartbeat),
      journal: journalHeartbeat,
      journal_age_seconds: ageSeconds(journalHeartbeat),
    },
  });
}
