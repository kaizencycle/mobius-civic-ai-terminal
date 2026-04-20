import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { handbookCorsHeaders } from '@/lib/http/handbook-cors';
import {
  isRedisAvailable,
  kvGet,
  kvHealth,
  KV_KEYS,
  loadSignalSnapshot,
  loadEchoState,
  loadTripwireState,
} from '@/lib/kv/store';
import { currentCycleId } from '@/lib/eve/cycle-engine';
import { getHeartbeat, getJournalHeartbeat } from '@/lib/runtime/heartbeat';
import { resolveGiForTerminal } from '@/lib/integrity/resolveGi';
import { loadMicReadinessSnapshotRaw } from '@/lib/mic/loadReadinessSnapshot';

export const dynamic = 'force-dynamic';

export async function OPTIONS(req: NextRequest) {
  const cors = handbookCorsHeaders(req.headers.get('origin'));
  if (!cors) {
    return new NextResponse(null, { status: 204 });
  }
  return new NextResponse(null, { status: 204, headers: cors });
}

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

export async function GET(req: NextRequest) {
  const start = Date.now();
  const cors = handbookCorsHeaders(req.headers.get('origin'));

  const [kv, micSnap, signals, echo, tripwire, pulse] = await Promise.all([
    kvHealth(),
    loadMicReadinessSnapshotRaw(),
    loadSignalSnapshot(),
    loadEchoState(),
    loadTripwireState(),
    kvGet<SystemPulse>(KV_KEYS.SYSTEM_PULSE),
  ]);
  const micSnapRaw = micSnap.raw;
  const giResolved = await resolveGiForTerminal({ micReadinessSnapshotRaw: micSnapRaw });
  const gi =
    giResolved.source === 'kv'
      ? giResolved.kv
      : giResolved.gi !== null
        ? {
            global_integrity: giResolved.gi,
            mode: typeof giResolved.mode === 'string' ? giResolved.mode : 'yellow',
            terminal_status: giResolved.terminal_status ?? 'stressed',
            primary_driver: giResolved.primary_driver ?? '',
            source: giResolved.source === 'live_compute' ? 'live' : 'cached',
            signals: {
              quality: 0.5,
              freshness: 0.5,
              stability: 0.5,
              system: 0.5,
            },
            timestamp: giResolved.timestamp ?? new Date().toISOString(),
          }
        : null;

  const cycle =
    (typeof pulse?.cycle === 'string' && pulse.cycle.trim().length > 0 ? pulse.cycle.trim() : null) ??
    echo?.cycleId?.trim() ??
    tripwire?.cycleId?.trim() ??
    currentCycleId();
  const giAge = age(gi?.timestamp);
  const signalAge = age(signals?.timestamp);
  const echoAge = age(echo?.timestamp);

  const lanes = {
    kv: { ok: kv.available, latency_ms: kv.latencyMs },
    backup_redis: {
      configured: kv.backup_redis.configured,
      available: kv.backup_redis.available,
      mirror_enabled: kv.backup_redis.mirror_enabled,
      read_fallback_enabled: kv.backup_redis.read_fallback_enabled,
      latency_ms: kv.backup_redis.latency_ms,
    },
    integrity: {
      ok: giResolved.gi !== null,
      gi: giResolved.gi ?? gi?.global_integrity ?? null,
      mode: (giResolved.mode as string | null) ?? gi?.mode ?? null,
      terminal_status: giResolved.terminal_status ?? gi?.terminal_status ?? null,
      source:
        giResolved.source === 'kv' ||
        giResolved.source === 'kv_carry_forward' ||
        giResolved.source === 'oaa_verified'
          ? 'kv'
          : giResolved.source === 'live_compute'
            ? 'live'
            : giResolved.source === 'readiness_snapshot'
              ? 'readiness_fallback'
              : 'null',
      provenance: giResolved.gi_provenance,
      verified: giResolved.verified,
      mic_readiness_snapshot_source: micSnap.source,
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

  const modeStr = (giResolved.mode as string | null) ?? gi?.mode ?? null;
  const degraded =
    giResolved.degraded ||
    !lanes.kv.ok ||
    !lanes.integrity.ok ||
    lanes.integrity.freshness === 'degraded' ||
    modeStr === 'red' ||
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
    gi: giResolved.gi ?? gi?.global_integrity ?? null,
    mode: modeStr,
    gi_source:
      giResolved.source === 'kv' ||
      giResolved.source === 'kv_carry_forward' ||
      giResolved.source === 'oaa_verified'
        ? 'kv'
        : giResolved.source === 'live_compute'
          ? 'live'
          : giResolved.source === 'readiness_snapshot'
            ? 'readiness_fallback'
            : 'null',
    gi_provenance: giResolved.gi_provenance,
    gi_verified: giResolved.verified,
    degraded,
    lanes,
    heartbeat: {
      runtime: getHeartbeat(),
      journal: getJournalHeartbeat(),
    },
    meta: {
      total_ms: Date.now() - start,
      kv_available: isRedisAvailable(),
      cycle_source:
        typeof pulse?.cycle === 'string' && pulse.cycle.trim().length > 0
          ? 'pulse'
          : echo?.cycleId?.trim()
            ? 'echo'
            : tripwire?.cycleId?.trim()
              ? 'tripwire'
              : 'calendar',
    },
  }, {
    headers: {
      ...(cors ?? {}),
      'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30',
      'X-Mobius-Source': 'terminal-snapshot-lite',
    },
  });
}
