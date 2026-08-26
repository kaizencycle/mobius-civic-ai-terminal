/**
 * C-412 — In-process snapshot-lite slice for instruments facade (no HTTP self-fetch).
 */

import type { GIState } from '@/lib/kv/store';
import { loadSnapshotLiteKvBundle } from '@/lib/kv/snapshotLiteKvBundle';
import { cachedByKey } from '@/lib/kv/snapshotLiteCache';
import { kvBridgeConfigured, kvBridgeRead } from '@/lib/kv/kvBridgeClient';
import { backupPrefixedGet } from '@/lib/kv/backup-redis';
import { currentCycleId } from '@/lib/eve/cycle-engine';
import { resolveGiForTerminal } from '@/lib/integrity/resolveGi';
import {
  resolveIntegrityDegraded,
} from '@/lib/integrity/integrityAuthority';
import {
  loadLatestZeusVerificationReport,
  mapZeusVerificationStatus,
  zeusGovernanceStateFromReport,
} from '@/lib/integrity/zeusCatalog';
import { getGiMode } from '@/lib/gi/mode';
import { computeGiVerification } from '@/app/api/terminal/snapshot-lite/route';

const SNAPSHOT_LITE_CACHE_KEY = 'terminal:snapshot-lite:v1';

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

function mapGiSource(source: string): string {
  if (source === 'kv' || source === 'kv_carry_forward' || source === 'oaa_verified') return 'kv';
  if (source === 'github_state_mirror') return 'github_state_mirror';
  if (source === 'live_compute') return 'live';
  if (source === 'readiness_snapshot') return 'readiness_fallback';
  return 'null';
}

export type SnapshotLiteSlice = {
  ok: boolean;
  degraded: boolean;
  gi: number | null;
  gi_provenance: string | null;
  gi_verified: boolean;
  gi_conflict: boolean;
  gi_floored: boolean;
  gi_source: string | null;
  mode: string | null;
  cycle: string;
  execution_authorized: boolean;
  lanes: Record<string, unknown>;
};

export async function loadSnapshotLiteSlice(): Promise<SnapshotLiteSlice> {
  const cycle = currentCycleId();

  let cached: Awaited<
    ReturnType<
      typeof cachedByKey<{
        bundle: Awaited<ReturnType<typeof loadSnapshotLiteKvBundle>>;
        mic: { raw: string | null; source: 'kv' | 'oaa' | 'none' };
      }>
    >
  >['value'];

  try {
    const cacheResult = await cachedByKey(SNAPSHOT_LITE_CACHE_KEY, async () => {
      const bundle = await loadSnapshotLiteKvBundle();
      const mic = await resolveMicRawWithBridge(bundle.micReadinessRaw);
      return { bundle, mic };
    });
    cached = cacheResult.value;
  } catch {
    return {
      ok: false,
      degraded: true,
      gi: null,
      gi_provenance: null,
      gi_verified: false,
      gi_conflict: false,
      gi_floored: false,
      gi_source: 'null',
      mode: null,
      cycle,
      execution_authorized: false,
      lanes: {},
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
  } catch {
    giResolved = {
      gi: null,
      raw_integrity: null,
      gi_floored: false,
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

  let giVerification = computeGiVerification(giResolved.gi, null, false);
  try {
    const mirrorState = await backupPrefixedGet<GIState>('gi:latest');
    const mirrorGi =
      typeof mirrorState?.global_integrity === 'number' ? mirrorState.global_integrity : null;
    giVerification = computeGiVerification(giResolved.gi, mirrorGi, false);
  } catch {
    giVerification = computeGiVerification(null, null, true);
  }

  const giState =
    giResolved.source === 'kv'
      ? giResolved.kv
      : giResolved.gi !== null
        ? {
            global_integrity: giResolved.gi,
            mode: typeof giResolved.mode === 'string' ? giResolved.mode : 'yellow',
            terminal_status: giResolved.terminal_status ?? 'stressed',
            timestamp: giResolved.timestamp ?? new Date().toISOString(),
          }
        : null;

  const pulse = bundle.pulse as SystemPulse | null;
  const signals = bundle.signals;
  const echo = bundle.echo;
  const tripwire = bundle.tripwire;
  const kv = bundle.kvHealth;

  const giAge = age(giState?.timestamp);
  const signalAge = age(signals?.timestamp);
  const echoAge = age(echo?.timestamp);

  const lanes: Record<string, unknown> = {
    kv: { ok: kv.available, latency_ms: kv.latencyMs },
    integrity: {
      ok: giResolved.gi !== null,
      gi: giResolved.gi ?? giState?.global_integrity ?? null,
      raw_integrity: giResolved.raw_integrity,
      gi_floored: giResolved.gi_floored,
      mode: (giResolved.mode as string | null) ?? giState?.mode ?? null,
      source: mapGiSource(giResolved.source),
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

  const modeStr = (giResolved.mode as string | null) ?? giState?.mode ?? null;
  const giNow = giResolved.gi ?? giState?.global_integrity ?? null;
  const latestZeus = loadLatestZeusVerificationReport();
  const zeusVerificationStatus = mapZeusVerificationStatus(latestZeus?.report.verification_status);
  const zeusGovernanceState = zeusGovernanceStateFromReport(latestZeus?.report);

  const degraded = resolveIntegrityDegraded({
    giDegraded: giResolved.degraded,
    kvOk: (lanes.kv as { ok: boolean }).ok,
    integrityLaneOk: (lanes.integrity as { ok: boolean }).ok,
    integrityFreshnessDegraded: (lanes.integrity as { freshness: string }).freshness === 'degraded',
    mode: modeStr ?? (giNow !== null ? getGiMode(giNow) : null),
    tripwireElevated: (lanes.tripwire as { elevated: boolean }).elevated,
    gicAvailable: Boolean(process.env.RENDER_GIC_URL),
    zeusVerificationStatus,
    governanceState: zeusGovernanceState,
  });

  const giScore = giResolved.gi ?? giState?.global_integrity ?? null;

  return {
    ok: true,
    degraded,
    gi: giScore,
    gi_provenance: giResolved.gi_provenance,
    gi_verified: giVerification.gi_verified,
    gi_conflict: giVerification.gi_conflict ?? false,
    gi_floored: giResolved.gi_floored,
    gi_source: mapGiSource(giResolved.source),
    mode: modeStr,
    cycle,
    execution_authorized: false,
    lanes,
  };
}
