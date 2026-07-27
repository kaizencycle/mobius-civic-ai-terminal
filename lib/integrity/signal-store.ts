import type { MobiusCivicIntegritySignal } from '@/lib/integrity-signal';
import { KV_KEYS, kvGet, kvSet } from '@/lib/kv/store';
import { KV_TTL_SECONDS } from '@/lib/kv/kv-ttl';

let latestIntegritySignal: MobiusCivicIntegritySignal | null = null;

export type IntegritySignalKvRow = {
  semantic_drift: number;
  timestamp: string;
  signal_id: string;
};

/** KV mirror only when geo semantic_drift is explicitly present (never coerce missing → 0). */
export function integritySignalDriftRow(signal: MobiusCivicIntegritySignal): IntegritySignalKvRow | null {
  const raw = signal.layers?.geo_layer?.semantic_drift;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  if (typeof signal.timestamp !== 'string' || !signal.timestamp.trim()) return null;
  if (typeof signal.signal_id !== 'string' || !signal.signal_id.trim()) return null;
  return {
    semantic_drift: raw,
    timestamp: signal.timestamp,
    signal_id: signal.signal_id,
  };
}

export function setLatestIntegritySignal(signal: MobiusCivicIntegritySignal): void {
  latestIntegritySignal = signal;
}

export async function persistIntegritySignalDriftToKv(
  signal: MobiusCivicIntegritySignal,
): Promise<boolean> {
  const row = integritySignalDriftRow(signal);
  if (!row) return false;
  await kvSet(KV_KEYS.INTEGRITY_SIGNAL_LATEST, row, KV_TTL_SECONDS.INTEGRITY_SIGNAL_LATEST);
  return true;
}

export function getLatestIntegritySignal(): MobiusCivicIntegritySignal | null {
  return latestIntegritySignal;
}

export async function loadPersistedIntegritySignalRow(): Promise<IntegritySignalKvRow | null> {
  const row = await kvGet<IntegritySignalKvRow>(KV_KEYS.INTEGRITY_SIGNAL_LATEST);
  if (!row || typeof row.semantic_drift !== 'number' || !Number.isFinite(row.semantic_drift)) {
    return null;
  }
  if (typeof row.timestamp !== 'string' || !row.timestamp.trim()) return null;
  return row;
}

/** @deprecated Prefer loadPersistedIntegritySignalRow for timestamp-aware merge */
export async function loadPersistedIntegritySignalDrift(): Promise<number | null> {
  const row = await loadPersistedIntegritySignalRow();
  return row?.semantic_drift ?? null;
}
