import type { MobiusCivicIntegritySignal } from '@/lib/integrity-signal';
import {
  KV_KEYS,
  kvCompareAndSetPrefixedJson,
  kvGet,
  kvGetPrefixedCasWitness,
} from '@/lib/kv/store';
import { KV_TTL_SECONDS } from '@/lib/kv/kv-ttl';

let latestIntegritySignal: MobiusCivicIntegritySignal | null = null;

const INTEGRITY_SIGNAL_CAS_ATTEMPTS = 5;

export type IntegritySignalKvRow = {
  semantic_drift: number;
  timestamp: string;
  signal_id: string;
};

export type ApplyIntegritySignalResult =
  | { ok: true; kvWritten: boolean }
  | { ok: false; reason: 'kv_unavailable' | 'stale_signal' };

export function integritySignalTimestampMs(timestamp: string): number {
  const ms = new Date(timestamp).getTime();
  return Number.isFinite(ms) ? ms : -1;
}

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

export function isIncomingIntegrityRowNewer(
  incoming: IntegritySignalKvRow,
  existing: IntegritySignalKvRow,
): boolean {
  const inMs = integritySignalTimestampMs(incoming.timestamp);
  const exMs = integritySignalTimestampMs(existing.timestamp);
  if (inMs > exMs) return true;
  if (inMs < exMs) return false;
  return incoming.signal_id >= existing.signal_id;
}

export function serializeIntegritySignalKvRow(row: IntegritySignalKvRow): string {
  return JSON.stringify({
    semantic_drift: row.semantic_drift,
    timestamp: row.timestamp,
    signal_id: row.signal_id,
  });
}

function parseIntegritySignalKvWitness(witness: string | null): IntegritySignalKvRow | null {
  if (!witness) return null;
  try {
    const parsed = JSON.parse(witness) as IntegritySignalKvRow;
    if (typeof parsed.semantic_drift !== 'number' || !Number.isFinite(parsed.semantic_drift)) return null;
    if (typeof parsed.timestamp !== 'string' || !parsed.timestamp.trim()) return null;
    if (typeof parsed.signal_id !== 'string' || !parsed.signal_id.trim()) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function compareAndSetIntegritySignalDriftRow(
  incoming: IntegritySignalKvRow,
): Promise<'written' | 'skipped_stale'> {
  const nextJson = serializeIntegritySignalKvRow(incoming);

  for (let attempt = 0; attempt < INTEGRITY_SIGNAL_CAS_ATTEMPTS; attempt++) {
    const witness = await kvGetPrefixedCasWitness(KV_KEYS.INTEGRITY_SIGNAL_LATEST);
    const existing = parseIntegritySignalKvWitness(witness);
    if (existing && !isIncomingIntegrityRowNewer(incoming, existing)) {
      return 'skipped_stale';
    }

    const cas = await kvCompareAndSetPrefixedJson(
      KV_KEYS.INTEGRITY_SIGNAL_LATEST,
      witness,
      nextJson,
      KV_TTL_SECONDS.INTEGRITY_SIGNAL_LATEST,
    );

    if (cas.ok) return 'written';

    const actualRow = parseIntegritySignalKvWitness(cas.actual);
    if (actualRow && !isIncomingIntegrityRowNewer(incoming, actualRow)) {
      return 'skipped_stale';
    }
  }

  return 'skipped_stale';
}

export function setLatestIntegritySignal(signal: MobiusCivicIntegritySignal): void {
  latestIntegritySignal = signal;
}

export type PersistIntegrityDriftOutcome = 'written' | 'skipped_no_drift' | 'skipped_stale';

export async function persistIntegritySignalDriftToKv(
  signal: MobiusCivicIntegritySignal,
): Promise<PersistIntegrityDriftOutcome> {
  const row = integritySignalDriftRow(signal);
  if (!row) return 'skipped_no_drift';

  return compareAndSetIntegritySignalDriftRow(row);
}

/**
 * Persist drift to KV (when present) before updating in-process head so serverless
 * breaker reads stay aligned with this instance.
 */
export async function commitLatestIntegritySignal(
  signal: MobiusCivicIntegritySignal,
): Promise<ApplyIntegritySignalResult> {
  const row = integritySignalDriftRow(signal);
  if (!row) {
    setLatestIntegritySignal(signal);
    return { ok: true, kvWritten: false };
  }

  try {
    const outcome = await persistIntegritySignalDriftToKv(signal);
    if (outcome === 'skipped_stale') {
      return { ok: false, reason: 'stale_signal' };
    }
    setLatestIntegritySignal(signal);
    return { ok: true, kvWritten: true };
  } catch (error) {
    console.error('[integrity-signal] integrity:signal:latest KV persist failed', error);
    return { ok: false, reason: 'kv_unavailable' };
  }
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
