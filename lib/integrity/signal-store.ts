import type { MobiusCivicIntegritySignal } from '@/lib/integrity-signal';
import { KV_KEYS, kvGet, kvSet } from '@/lib/kv/store';
import { KV_TTL_SECONDS } from '@/lib/kv/kv-ttl';

let latestIntegritySignal: MobiusCivicIntegritySignal | null = null;

export type IntegritySignalKvRow = {
  semantic_drift: number;
  timestamp: string;
  signal_id: string;
};

export function setLatestIntegritySignal(signal: MobiusCivicIntegritySignal): void {
  latestIntegritySignal = signal;
  const drift = signal.layers?.geo_layer?.semantic_drift;
  if (typeof drift !== 'number' || !Number.isFinite(drift)) return;
  const row: IntegritySignalKvRow = {
    semantic_drift: drift,
    timestamp: signal.timestamp,
    signal_id: signal.signal_id,
  };
  void kvSet(KV_KEYS.INTEGRITY_SIGNAL_LATEST, row, KV_TTL_SECONDS.INTEGRITY_SIGNAL_LATEST).catch(() => {});
}

export function getLatestIntegritySignal(): MobiusCivicIntegritySignal | null {
  return latestIntegritySignal;
}

export async function loadPersistedIntegritySignalDrift(): Promise<number | null> {
  const row = await kvGet<IntegritySignalKvRow>(KV_KEYS.INTEGRITY_SIGNAL_LATEST);
  if (!row || typeof row.semantic_drift !== 'number' || !Number.isFinite(row.semantic_drift)) {
    return null;
  }
  return row.semantic_drift;
}
