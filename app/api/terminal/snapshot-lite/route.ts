import { NextResponse } from 'next/server';
import {
  isRedisAvailable,
  kvGet,
  kvHealth,
  KV_KEYS,
  loadGIState,
  loadSignalSnapshot,
  loadEchoState,
  loadTripwireState,
} from '@/lib/kv/store';
import { currentCycleId } from '@/lib/eve/cycle-engine';
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

function age(ts: string | null | undefined): number | null {
  if (!ts) return null;
  const ms = new Date(ts).getTime();
  return Number.isFinite(ms) ? Math.max(0, Math.floor((Date.now() - ms) / 1000)) : null;
}

function freshness(sec: number | null): 'fresh' | 'nominal' | 'stale' | 'degraded' | 'unknown' {
  if (sec == null) return 'unknown';
  if (sec < 600) return 'fresh';
  if (sec < 1800) return 'nominal';
  if (sec < 3600) return 'stale';
  return 'degraded';
}

export async function GET() {
  const start = Date.now();

  const [kv, gi, signals, echo, tripwire, pulse] = await Promise.all([
    kvHealth(),
    loadGIState(),
    loadSignalSnapshot(),
    loadEchoState(),
    loadTripwireState(),
    kvGet<SystemPulse>(KV_KEYS.SYSTEM_PULSE),
  ]);

  const cycle = pulse?.cycle ?? gi?.mode ? currentCycleId() : currentCycleId();
  const giAge = age(gi?.timestamp);
  const signalAge = age(signals?.timestamp);
  const echoAge = age(echo?.timestamp);

  const lanes = {
    kv: { ok: kv.available, latency_ms: kv.latencyMs },
    integrity: {
      ok: Boolean(gi),
      gi: gi?.global_integrity ?? null,
      mode: gi?.mode ?? null,
      terminal_status: gi?.terminal_status ?? null,
      source: gi?.source ?? null,
      freshness: freshness(giAge),
      age_seconds: giAge,
    },
    signals: {
      ok: Boolean(signals),
      composite: signals?.composite ?? null,
      anomalies: signals?.anomalies ?? null,
      healthy: signals?.healthy ?? null,
      freshness: freshness(signalAge),
      age_seconds: signalAge,
    },
    echo: {
      ok: Boolean(echo),
      cycle: echo?.cycleId ?? null,
      total_ingested: echo?.totalIngested ?? null,
      healthy: echo?.healthy ?? null,
      freshness: freshness(echoAge),
      age_seconds: echoAge,
    },
    tripwire: {
      ok: Boolean(tripwire),
      elevated: tripwire?.elevated ?? false,
      count: tripwire?.tripwireCount ?? 0,
    },
    pulse: {
      ok: Boolean(pulse?.timestamp),
      composite: pulse?.composite ?? null,
      instruments: pulse?.instruments ?? null,
      anomalies: pulse?.anomalies ?? null,
      freshness: freshness(age(pulse?.timestamp)),
    },
  };

  const degraded =
    !lanes.kv.ok ||
    !lanes.integrity.ok ||
    lanes.integrity.freshness === 'degraded' ||
    (gi?.mode === 'red') ||
    lanes.tripwire.elevated;

  return NextResponse.json({
    ok: true,
    lite: true,
    cycle,
    timestamp: new Date().toISOString(),
    deployment: {
      commit_sha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      environment: process.env.VERCEL_ENV ?? null,
    },
    gi: gi?.global_integrity ?? null,
    mode: gi?.mode ?? null,
    degraded,
    lanes,
    heartbeat: {
      runtime: getHeartbeat(),
      journal: getJournalHeartbeat(),
    },
    meta: {
      total_ms: Date.now() - start,
      kv_available: isRedisAvailable(),
    },
  }, {
    headers: {
      'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30',
      'X-Mobius-Source': 'terminal-snapshot-lite',
    },
  });
}
