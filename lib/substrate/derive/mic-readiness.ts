// C-356 — Derive MIC readiness snapshot from vault status when KV is suspended.

import { getVaultStatusPayload } from '@/lib/vault/vault';
import { VAULT_RESERVE_PARCEL_UNITS } from '@/lib/vault-v2/constants';

export type MicReadinessSnapshot = {
  ready: boolean;
  reserve: number;
  threshold: number;
  source: 'vault-derive';
  timestamp: string;
};

export async function deriveMicReadinessFromVault(): Promise<MicReadinessSnapshot | null> {
  try {
    const status = await getVaultStatusPayload(null);
    return {
      ready: status.balance_reserve >= VAULT_RESERVE_PARCEL_UNITS,
      reserve: Number(status.balance_reserve.toFixed(6)),
      threshold: VAULT_RESERVE_PARCEL_UNITS,
      source: 'vault-derive',
      timestamp: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}
