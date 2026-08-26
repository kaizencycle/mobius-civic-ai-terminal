import { currentCycleId } from '@/lib/eve/cycle-engine';
import { computeIntegrityPayload } from '@/lib/integrity/buildStatus';
import { loadMicReadinessSnapshotRaw } from '@/lib/mic/loadReadinessSnapshot';
import { assessKvKeyHealth } from '@/lib/kv/kvKeyHealth';
import { isRedisAvailable } from '@/lib/kv/store';
import { deriveInstrumentsAlerts } from '@/lib/instruments/deriveAlerts';
import { loadMicroInstrumentPayload } from '@/lib/instruments/loadMicroInstrumentPayload';
import {
  MOBIUS_INSTRUMENTS_SCHEMA_VERSION,
  type MobiusInstrumentsSnapshot,
} from '@/lib/instruments/types';

type SnapshotLiteBody = {
  ok?: boolean;
  degraded?: boolean;
  gi?: number | null;
  gi_provenance?: string | null;
  gi_verified?: boolean;
  gi_conflict?: boolean;
  gi_floored?: boolean;
  gi_source?: string | null;
  mode?: string | null;
  cycle?: string;
  execution_authorized?: boolean;
  lanes?: Record<string, unknown> | null;
};

async function fetchSnapshotLite(baseUrl: string): Promise<SnapshotLiteBody> {
  try {
    const res = await fetch(`${baseUrl}/api/terminal/snapshot-lite`, { cache: 'no-store' });
    if (!res.ok) {
      return {
        ok: false,
        degraded: true,
        cycle: currentCycleId(),
        execution_authorized: false,
        lanes: null,
      };
    }
    return (await res.json()) as SnapshotLiteBody;
  } catch {
    return {
      ok: false,
      degraded: true,
      cycle: currentCycleId(),
      execution_authorized: false,
      lanes: null,
    };
  }
}

/**
 * Composed protocol snapshot for World Renderer HUD.
 * GI/cycle/lanes sourced from snapshot-lite (parity guarantee); instruments from micro cache/route.
 */
export async function composeInstrumentsSnapshot(baseUrl: string): Promise<MobiusInstrumentsSnapshot> {
  const [lite, microLoad, integrity, micRaw, kvHealth] = await Promise.all([
    fetchSnapshotLite(baseUrl),
    loadMicroInstrumentPayload(baseUrl),
    computeIntegrityPayload(),
    loadMicReadinessSnapshotRaw(),
    isRedisAvailable() ? assessKvKeyHealth() : Promise.resolve(null),
  ]);

  const micro = microLoad.payload;
  const liteOk = lite.ok !== false;
  const microOk = micro?.ok === true;
  const integrityDegraded = integrity.source === 'mock' || integrity.kv === false;

  const degraded =
    lite.degraded === true ||
    microLoad.degraded ||
    integrityDegraded ||
    kvHealth?.kv_continuity_ok === false;

  const alerts = deriveInstrumentsAlerts({
    liteDegraded: lite.degraded,
    lanes: lite.lanes as Record<string, { ok?: boolean; freshness?: string; elevated?: boolean }> | null,
    failedInstruments: micro?.failedInstruments,
    kvContinuityOk: kvHealth?.kv_continuity_ok ?? null,
    integrityDegraded,
  });

  return {
    schema_version: MOBIUS_INSTRUMENTS_SCHEMA_VERSION,
    timestamp: new Date().toISOString(),
    ok: liteOk && (microOk || microLoad.cached),
    degraded,
    gi: {
      score: lite.gi ?? integrity.global_integrity ?? null,
      provenance: lite.gi_provenance ?? null,
      verified: lite.gi_verified ?? null,
      conflict: lite.gi_conflict ?? null,
      floored: lite.gi_floored ?? null,
      source: lite.gi_source ?? integrity.source ?? null,
      mode: lite.mode ?? integrity.mode ?? null,
    },
    cycle: {
      id: lite.cycle ?? integrity.cycle ?? currentCycleId(),
      execution_authorized: lite.execution_authorized ?? false,
    },
    mic: {
      readiness_source: micRaw.source ?? null,
      supply: integrity.mic_supply,
      supply_source: integrity.mic_supply_source,
    },
    instruments: {
      count: micro?.instrumentCount ?? null,
      errors: micro?.errors ?? null,
      fallbacks_used: micro?.fallbacksUsed ?? null,
      failed: micro?.failedInstruments ?? [],
      items: (micro?.instruments ?? []).map((inst) => ({
        id: inst.id,
        agent: inst.agent,
        label: inst.label,
        score: inst.score,
        source: inst.source,
        latencyMs: inst.latencyMs,
      })),
      cached: microLoad.cached,
      degraded: microLoad.degraded,
    },
    agents: micro?.agentComposites ?? [],
    lanes: lite.lanes ?? null,
    kv: {
      continuity_ok: kvHealth?.kv_continuity_ok ?? null,
      diagnostic_ok: kvHealth?.kv_diagnostic_ok ?? null,
    },
    alerts,
  };
}
