import { getVaultStatusPayload } from '@/lib/vault/vault';
import { computeVaultSealLaneSemantics } from '@/lib/vault/lane-status';
import type { DalResult } from '@/lib/dal/types';
import { degradedDalResult, okDalResult, nowIso } from '@/lib/dal/types';

export type VaultDalSnapshot = {
  status: 'sealed' | 'preview' | 'activating';
  balance_reserve: number;
  gi_current: number | null;
  preview_active: boolean;
  source_entries: number;
  reserve_lane: string;
  reserve_block_lane: string;
  headline: string;
  timestamp: string;
};

/**
 * C-303 additive DAL scaffold.
 *
 * IMPORTANT:
 * - no route rewrites yet
 * - no UI rewrites yet
 * - no internal fetches
 * - server-safe reads only
 */
export async function readVaultDalSnapshot(
  giCurrent: number | null,
): Promise<DalResult<VaultDalSnapshot>> {
  try {
    const v1 = await getVaultStatusPayload(giCurrent);

    const lane = computeVaultSealLaneSemantics({
      v1BalanceReserve: v1.balance_reserve,
      inProgressBalance: 0,
      sealsCountAttested: 0,
      sealsAuditCount: 0,
      giCurrent,
      giThreshold: v1.gi_threshold,
      sustainCyclesRequired: v1.sustain_cycles_required,
      v1Status: v1.status,
      candidateInFlight: false,
    });

    return okDalResult(
      {
        status: v1.status,
        balance_reserve: v1.balance_reserve,
        gi_current: v1.gi_current,
        preview_active: v1.preview_active,
        source_entries: v1.source_entries,
        reserve_lane: lane.reserve_lane,
        reserve_block_lane: lane.reserve_block_lane,
        headline: lane.headline,
        timestamp: nowIso(),
      },
      {
        source: 'computed',
        freshness: 'live',
        timestamp: nowIso(),
        note: 'DAL scaffold sourced from canonical vault libraries',
      },
    );
  } catch (error) {
    return degradedDalResult<VaultDalSnapshot>({
      source: 'fallback',
      error: error instanceof Error ? error.message : 'unknown_vault_dal_error',
      note: 'Vault DAL scaffold degraded during additive extraction',
    });
  }
}
