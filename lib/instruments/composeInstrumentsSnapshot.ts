import { currentCycleId } from '@/lib/eve/cycle-engine';
import { computeIntegrityPayload } from '@/lib/integrity/buildStatus';
import { loadMicReadinessSnapshotRaw } from '@/lib/mic/loadReadinessSnapshot';
import { assessKvKeyHealth } from '@/lib/kv/kvKeyHealth';
import { isRedisAvailable } from '@/lib/kv/store';
import { deriveInstrumentsAlerts } from '@/lib/instruments/deriveAlerts';
import { loadMicroInstrumentPayload } from '@/lib/instruments/loadMicroInstrumentPayload';
import { loadSnapshotLiteSlice } from '@/lib/instruments/loadSnapshotLiteSlice';
import {
  MOBIUS_INSTRUMENTS_SCHEMA_VERSION,
  type MobiusInstrumentsSnapshot,
} from '@/lib/instruments/types';

/**
 * Composed protocol snapshot for World Renderer HUD (in-process loaders only).
 */
export async function composeInstrumentsSnapshot(): Promise<MobiusInstrumentsSnapshot> {
  const [lite, microLoad, integrity, micRaw, kvHealth] = await Promise.all([
    loadSnapshotLiteSlice(),
    loadMicroInstrumentPayload(),
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
    lanes: lite.lanes as Record<string, { ok?: boolean; freshness?: string; elevated?: boolean }>,
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
      score: lite.gi,
      provenance: lite.gi_provenance,
      verified: lite.gi_verified,
      conflict: lite.gi_conflict,
      floored: lite.gi_floored,
      source: lite.gi_source,
      mode: lite.mode,
    },
    cycle: {
      id: lite.cycle ?? currentCycleId(),
      execution_authorized: lite.execution_authorized,
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
    lanes: lite.lanes,
    kv: {
      continuity_ok: kvHealth?.kv_continuity_ok ?? null,
      diagnostic_ok: kvHealth?.kv_diagnostic_ok ?? null,
    },
    alerts,
  };
}
