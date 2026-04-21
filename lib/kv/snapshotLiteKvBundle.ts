/**
 * Single MGET bundle for `/api/terminal/snapshot-lite` hot KV reads.
 */

import { kvHealth, KV_KEYS, type EchoKVState, type GIState, type SignalSnapshot, type TripwireKVState } from '@/lib/kv/store';
import { kvMgetPrefixedLogicalKeys } from '@/lib/kv/batchRead';

export const SNAPSHOT_LITE_MGET_KEYS = [
  KV_KEYS.MIC_READINESS_SNAPSHOT,
  KV_KEYS.SIGNAL_SNAPSHOT,
  KV_KEYS.ECHO_STATE,
  KV_KEYS.TRIPWIRE_STATE,
  KV_KEYS.SYSTEM_PULSE,
  KV_KEYS.GI_STATE,
  KV_KEYS.GI_STATE_CARRY,
] as const;

type SystemPulse = {
  ok?: boolean;
  composite?: number;
  cycle?: string;
  instruments?: number;
  anomalies?: number;
  timestamp?: string;
};

export type SnapshotLiteKvBundle = {
  kvHealth: Awaited<ReturnType<typeof kvHealth>>;
  micReadinessRaw: string | null;
  signals: SignalSnapshot | null;
  echo: EchoKVState | null;
  tripwire: TripwireKVState | null;
  pulse: SystemPulse | null;
  giState: GIState | null;
  giCarry: GIState | null;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== 'object') return null;
  return v as Record<string, unknown>;
}

function parseMicRaw(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v.trim() !== '' ? v : null;
  try {
    return JSON.stringify(v);
  } catch {
    return null;
  }
}

export async function loadSnapshotLiteKvBundle(): Promise<SnapshotLiteKvBundle> {
  const [kv, raw] = await Promise.all([kvHealth(), kvMgetPrefixedLogicalKeys([...SNAPSHOT_LITE_MGET_KEYS])]);

  const micReadinessRaw = parseMicRaw(raw[0]);
  const signals = asRecord(raw[1]) as SignalSnapshot | null;
  const echo = asRecord(raw[2]) as EchoKVState | null;
  const tripwire = asRecord(raw[3]) as TripwireKVState | null;
  const pulse = asRecord(raw[4]) as SystemPulse | null;
  const giState =
    raw[5] != null && typeof raw[5] === 'object' && typeof (raw[5] as GIState).global_integrity === 'number'
      ? (raw[5] as GIState)
      : null;
  const giCarry =
    raw[6] != null && typeof raw[6] === 'object' && typeof (raw[6] as GIState).global_integrity === 'number'
      ? (raw[6] as GIState)
      : null;

  return {
    kvHealth: kv,
    micReadinessRaw,
    signals: signals && typeof signals.timestamp === 'string' ? signals : null,
    echo: echo && typeof echo.timestamp === 'string' ? echo : null,
    tripwire: tripwire && typeof tripwire.timestamp === 'string' ? tripwire : null,
    pulse,
    giState,
    giCarry,
  };
}
