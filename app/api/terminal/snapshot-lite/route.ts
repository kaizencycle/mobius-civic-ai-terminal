import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { handbookCorsHeaders } from '@/lib/http/handbook-cors';
import { isRedisAvailable } from '@/lib/kv/store';
import { loadSnapshotLiteKvBundle } from '@/lib/kv/snapshotLiteKvBundle';
import { cachedByKey } from '@/lib/kv/snapshotLiteCache';
import { kvBridgeConfigured, kvBridgeRead } from '@/lib/kv/kvBridgeClient';
import { currentCycleId } from '@/lib/eve/cycle-engine';
import { getHeartbeat, getJournalHeartbeat } from '@/lib/runtime/heartbeat';
import { resolveGiForTerminal } from '@/lib/integrity/resolveGi';

export const dynamic = 'force-dynamic';

const SNAPSHOT_LITE_CACHE_KEY = 'terminal:snapshot-lite:v1';

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

async function resolveMicRawWithBridge(micFromMget: string | null): Promise<{ raw: string | null; source: 'kv' | 'oaa' | 'none' }> {
  if (micFromMget !== null && micFromMget.trim() !== '') {
    return { raw: micFromMget, source: 'kv' };
  }
  if (!kvBridgeConfigured()) {
    return { raw: null, source: 'none' };
  }
  const row = await kvBridgeRead('MIC_READINESS_SNAPSHOT');
  if (!row?.ok || row.value == null) {
    return { raw: null, source: 'none' };
  }
  if (typeof row.value === 'string') {
    return { raw: row.value, source: 'oaa' };
  }
  try {
    return { raw: JSON.stringify(row.value), source: 'oaa' };
  } catch {
    return { raw: null, source: 'none' };
  }
}

export async function GET(req: NextRequest) {
  const start = Date.now();
  const cors = handbookCorsHeaders(req.headers.get('origin'));
  try {

    let cached: Awaited<ReturnType<typeof cachedByKey<{ bundle: Awaited<ReturnType<typeof loadSnapshotLiteKvBundle>>; mic: { raw: string | null; source: 'kv' | 'oaa' | 'none' } }>>>['value'];
    let cacheFresh = false;
    try {
      const cacheResult = await cachedByKey(SNAPSHOT_LITE_CACHE_KEY, async () => {
        const bundle = await loadSnapshotLiteKvBundle();
        const mic = await resolveMicRawWithBridge(bundle.micReadinessRaw);
        return { bundle, mic };
      });
      cached = cacheResult.value;
      cacheFresh = cacheResult.fresh;
    } catch (error) {
      console.error('[terminal/snapshot-lite] cache/bundle load failed:', error);
      cached = {
        bundle: {
          giState: null,
          giCarry: null,
          pulse: null,
          signals: null,
          echo: null,
          tripwire: null,
          micReadinessRaw: null,
          kvHealth: {
            available: false,
            configured: false,
            latencyMs: null,
            error: null,
            backup_redis: {
              configured: false,
              available: false,
              mirror_enabled: false,
              read_fallback_enabled: false,
              latency_ms: null,
              error: null,
            },
          },
        },
        mic: { raw: null, source: 'none' },
      };
    }

    const { bundle, mic } = cached;
    const micSnapRaw = mic.raw;
    const micSnapSource = mic.source;

    let giResolved: Awaited<ReturnType<typeof resolveGiForTerminal>>;
    try {
      giResolved = await resolveGiForTerminal({
        micReadinessSnapshotRaw: micSnapRaw,
        preloadedGi: { primary: bundle.giState, carry: bundle.giCarry },
      });
    } catch (error) {
      console.error('[terminal/snapshot-lite] GI resolve failed:', error);
      giResolved = {
        gi: null,
        mode: 'yellow',
        source: 'null',
        gi_provenance: 'unknown',
        verified: false,
        degraded: true,
        terminal_status: 'stressed',
        primary_driver: null,
        timestamp: new Date().toISOString(),
        age_seconds: null,
        kv: null,
      };
    }

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

  const pulse = bundle.pulse as SystemPulse | null;
  const signals = bundle.signals;
  const echo = bundle.echo;
  const tripwire = bundle.tripwire;
  const kv = bundle.kvHealth;

  // currentCycleId() is deterministic from the calendar date and is always authoritative.
  // KV-sourced values (pulse.cycle, echo.cycleId) can be stale across cycle boundaries,
  // which previously caused the digest to broadcast the wrong cycle to all UI consumers.
  const cycle = currentCycleId();
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
      mic_readiness_snapshot_source: micSnapSource,
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

    return NextResponse.json(
      {
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
          kv_bundle_mget: true,
          kv_cache_fresh: cacheFresh,
          cycle_source: 'calendar',
        },
      },
      {
        headers: {
          ...(cors ?? {}),
          'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30',
          'X-Cache-Strategy': 'edge-15s',
          'X-Mobius-Source': 'terminal-snapshot-lite',
        },
      },
    );
  } catch (error) {
    console.error('[terminal/snapshot-lite] fatal error:', error);
    const msg = error instanceof Error ? error.message : 'snapshot_lite_failed';
    return NextResponse.json(
      {
        ok: false,
        lite: true,
        fallback: true,
        error: msg,
        cycle: currentCycleId(),
        timestamp: new Date().toISOString(),
        deployment: {
          commit_sha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
          environment: process.env.VERCEL_ENV ?? null,
        },
        gi: null,
        mode: 'yellow',
        gi_source: 'null',
        gi_provenance: null,
        gi_verified: false,
        degraded: true,
        lanes: {
          kv: { ok: false, latency_ms: null },
          backup_redis: {
            configured: false,
            available: false,
            mirror_enabled: false,
            read_fallback_enabled: false,
            latency_ms: null,
          },
          integrity: {
            ok: false,
            gi: null,
            mode: null,
            terminal_status: 'stressed',
            source: 'null',
            provenance: null,
            verified: false,
            mic_readiness_snapshot_source: 'none',
            freshness: 'unknown',
            age_seconds: null,
          },
          signals: {
            ok: false,
            composite: null,
            anomalies: null,
            healthy: null,
            freshness: 'unknown',
            age_seconds: null,
          },
          echo: {
            ok: false,
            cycle: null,
            total_ingested: null,
            healthy: null,
            freshness: 'unknown',
            age_seconds: null,
          },
          tripwire: {
            ok: false,
            elevated: false,
            count: 0,
          },
          pulse: {
            ok: false,
            composite: null,
            instruments: null,
            anomalies: null,
            freshness: 'unknown',
          },
        },
        heartbeat: {
          runtime: getHeartbeat(),
          journal: getJournalHeartbeat(),
        },
        meta: {
          total_ms: Date.now() - start,
          kv_available: isRedisAvailable(),
          kv_bundle_mget: false,
          kv_cache_fresh: false,
          cycle_source: 'calendar',
        },
      },
      {
        status: 200,
        headers: {
          ...(cors ?? {}),
          'Cache-Control': 'no-store',
          'X-Mobius-Source': 'terminal-snapshot-lite-fallback',
        },
      },
    );
  }
}
