/**
 * C-287 — Shared micro-sensor sweep + KV persistence (cron + GET /api/signals/micro).
 */

import { pollAllMicroAgents } from '@/lib/agents/micro';
import {
  saveSignalSnapshot,
  isRedisAvailable,
  kvSet,
  KV_KEYS,
  KV_TTL_SECONDS,
  saveGiStateFromMicroSweep,
  loadGIState,
} from '@/lib/kv/store';
import { updateSustainTrackingFromGi } from '@/lib/mic/sustainTracker';
import { currentCycleId } from '@/lib/eve/cycle-engine';
import { pushLedgerEntry } from '@/lib/epicon/ledgerPush';

let lastLedgerPushMs = 0;
const LEDGER_PUSH_INTERVAL_MS = 10 * 60 * 1000;

export type MicroSweepResult = Awaited<ReturnType<typeof pollAllMicroAgents>>;

/**
 * Runs full instrument poll and persists GI, signals, heartbeat, system pulse, sustain.
 */
export async function runMicroSweepPipeline(now = Date.now()): Promise<MicroSweepResult> {
  const result = await pollAllMicroAgents();

  const signalQuality =
    result.allSignals.length > 0
      ? result.allSignals.reduce((s, x) => s + x.value, 0) / result.allSignals.length
      : result.composite;

  const preGi = isRedisAvailable() ? await loadGIState() : null;
  await saveGiStateFromMicroSweep({ composite: result.composite, signalQuality, preloadedGi: preGi });
  await updateSustainTrackingFromGi(result.composite);

  if (isRedisAvailable()) {
    await saveSignalSnapshot({
      composite: result.composite,
      anomalies: result.anomalies?.length ?? 0,
      allSignals: (result.allSignals ?? []).map((s) => ({
        agentName: s.agentName,
        source: s.source,
        value: s.value,
        label: s.label,
        severity: s.severity,
        timestamp: s.timestamp,
      })),
      timestamp: result.timestamp,
      healthy: result.healthy,
    });

    await kvSet(
      KV_KEYS.HEARTBEAT,
      JSON.stringify({
        ok: true,
        gi: result.composite,
        cycle: currentCycleId(),
        anomalies: result.anomalies?.length ?? 0,
        familyCount: 8,
        instrumentCount: result.instrumentCount ?? 40,
        timestamp: result.timestamp,
        source: 'micro-sweep',
      }),
      KV_TTL_SECONDS.HEARTBEAT,
    );

    await kvSet(
      KV_KEYS.SYSTEM_PULSE,
      {
        ok: true,
        composite: result.composite,
        cycle: currentCycleId(),
        instruments: result.instrumentCount ?? 40,
        anomalies: result.anomalies?.length ?? 0,
        timestamp: result.timestamp,
      },
      KV_TTL_SECONDS.SYSTEM_PULSE,
    );

    if (now - lastLedgerPushMs > LEDGER_PUSH_INTERVAL_MS) {
      lastLedgerPushMs = now;
      void pushLedgerEntry({
        id: `micro-sweep-${currentCycleId()}-${Date.now()}`,
        timestamp: result.timestamp,
        author: 'DAEDALUS',
        title: `Sensor sweep: ${result.instrumentCount ?? 40} instruments, composite ${result.composite.toFixed(3)}, ${result.anomalies?.length ?? 0} anomalies`,
        type: 'epicon',
        severity: (result.anomalies?.length ?? 0) > 5 ? 'elevated' : 'nominal',
        source: 'kv-ledger',
        tags: ['micro-sweep', 'heartbeat', currentCycleId()],
        verified: false,
        category: 'heartbeat',
        status: 'committed',
        agentOrigin: 'DAEDALUS',
      }).catch(() => {});
    }
  }

  return result;
}
