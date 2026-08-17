/**
 * C-406 — KV key health semantics (continuity vs diagnostic).
 *
 * Continuity keys match the seed route minimum — absence blocks operator continuity.
 * Diagnostic keys are cron-populated or failure-path keys; absence is often nominal.
 * LEDGER_CIRCUIT_OPEN is inverted: absence means circuit closed (healthy).
 */

import { KV_KEYS, kvExists, kvGet, kvGetRaw } from '@/lib/kv/store';

/** Minimum keys written by POST /api/admin/seed-kv and EPICON KV sync CI. */
export const KV_CONTINUITY_KEY_NAMES = [
  'GI_STATE',
  'HEARTBEAT',
  'LAST_INGEST',
  'SIGNAL_SNAPSHOT',
] as const;

export type KvContinuityKeyName = (typeof KV_CONTINUITY_KEY_NAMES)[number];

/** Keys whose absence is healthy (only written on failure / open circuit). */
export const KV_INVERTED_ABSENCE_OK = new Set<string>(['LEDGER_CIRCUIT_OPEN']);

export type KvKeyPresence = {
  present: boolean;
  /** When true, absence counts as healthy (inverted semantics). */
  inverted_absence_ok: boolean;
};

export type KvKeyHealthReport = {
  continuity: Record<KvContinuityKeyName, KvKeyPresence>;
  diagnostic: Record<string, KvKeyPresence>;
  continuity_present: number;
  continuity_required: number;
  diagnostic_present: number;
  diagnostic_required: number;
  /** Seed-minimum keys — operator continuity gate. */
  kv_continuity_ok: boolean;
  /** Full diagnostic enumeration including optional cron keys. */
  kv_diagnostic_ok: boolean;
  /**
   * Public continuity boolean (C-406 semantic repair).
   * Alias of kv_continuity_ok — NOT the pre-C-406 "every KV_KEYS entry" superset.
   */
  kv_keys_ok: boolean;
  /** Pre-C-406 superset semantics — all continuity + diagnostic keys satisfied. */
  kv_keys_all_ok: boolean;
};

async function keyPresent(key: string, name: string): Promise<boolean> {
  if (key === KV_KEYS.MIC_READINESS_FEED) {
    return kvExists(key);
  }
  const val = await kvGet(key);
  return val !== null;
}

export async function assessKvKeyHealth(): Promise<KvKeyHealthReport> {
  const continuity: Record<KvContinuityKeyName, KvKeyPresence> = {
    GI_STATE: { present: false, inverted_absence_ok: false },
    HEARTBEAT: { present: false, inverted_absence_ok: false },
    LAST_INGEST: { present: false, inverted_absence_ok: false },
    SIGNAL_SNAPSHOT: { present: false, inverted_absence_ok: false },
  };

  for (const name of KV_CONTINUITY_KEY_NAMES) {
    const key = KV_KEYS[name];
    continuity[name] = {
      present: await keyPresent(key, name),
      inverted_absence_ok: false,
    };
  }

  const diagnostic: Record<string, KvKeyPresence> = {};
  for (const [name, key] of Object.entries(KV_KEYS)) {
    if ((KV_CONTINUITY_KEY_NAMES as readonly string[]).includes(name)) {
      continue;
    }
    const inverted = KV_INVERTED_ABSENCE_OK.has(name);
    const present = await keyPresent(key, name);
    diagnostic[name] = { present, inverted_absence_ok: inverted };
  }

  const legacyTripwire = await kvGetRaw<string>('TRIPWIRE_STATE');
  diagnostic.TRIPWIRE_STATE_REDIS = {
    present: legacyTripwire !== null && legacyTripwire !== undefined,
    inverted_absence_ok: false,
  };

  const bal = await kvGet<number>(KV_KEYS.VAULT_GLOBAL_BALANCE);
  const meta = await kvGet<unknown>(KV_KEYS.VAULT_GLOBAL_META);
  diagnostic.VAULT_STATE = {
    present: bal !== null || meta !== null,
    inverted_absence_ok: false,
  };

  const continuityOk = KV_CONTINUITY_KEY_NAMES.every((name) => continuity[name].present);
  const diagnosticOk = Object.entries(diagnostic).every(([name, row]) => {
    if (row.inverted_absence_ok) {
      return !row.present;
    }
    return row.present;
  });

  const continuityPresent = KV_CONTINUITY_KEY_NAMES.filter((n) => continuity[n].present).length;
  const diagnosticPresent = Object.values(diagnostic).filter((row) => {
    if (row.inverted_absence_ok) return !row.present;
    return row.present;
  }).length;

  return {
    continuity,
    diagnostic,
    continuity_present: continuityPresent,
    continuity_required: KV_CONTINUITY_KEY_NAMES.length,
    diagnostic_present: diagnosticPresent,
    diagnostic_required: Object.keys(diagnostic).length,
    kv_continuity_ok: continuityOk,
    kv_diagnostic_ok: diagnosticOk,
    kv_keys_ok: continuityOk,
    kv_keys_all_ok: continuityOk && diagnosticOk,
  };
}
