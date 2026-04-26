/**
 * Operator-facing Vault lane labels: Reserve Block sealing vs Fountain / integrity.
 *
 * A Reserve Block is the operator-facing name for one canonical 50-unit v2
 * reserve parcel. Internal API names may still expose tranche fields for
 * backwards compatibility, but the UI/protocol language should describe each
 * 50-unit parcel as a Block.
 */

import { VAULT_RESERVE_PARCEL_UNITS } from '@/lib/vault-v2/constants';

export type VaultFountainLaneStatus = 'locked' | 'preview' | 'tracking' | 'unsealed' | 'active';

/**
 * Keep legacy string tokens until all downstream readiness consumers migrate.
 * Operator-facing UI translates these to Reserve Block language.
 */
export type VaultReserveLaneStatus = 'accumulating' | 'tranche_ready' | 'sealing' | 'sealed_tranches';

export type ReserveBlockSummary = {
  block_size: number;
  sealed_blocks: number;
  audit_blocks: number;
  completed_blocks_v1: number;
  in_progress_block: number;
  in_progress_balance: number;
  in_progress_pct: number;
  remaining_to_next_block: number;
  label: string;
  canon: string;
};

export type VaultSealOneSemantics = {
  sealed_reserve_total: number;
  current_tranche_balance: number;
  carry_forward_in_tranche: number;
  reserve_threshold: number;
  reserve_threshold_met: boolean;
  reserve_block: ReserveBlockSummary;
  gi_threshold: number;
  gi_threshold_met: boolean;
  sustain_cycles_required: number;
  sustain_met: boolean;
  vault_status: 'sealed' | 'preview' | 'activating';
  reserve_lane: VaultReserveLaneStatus;
  reserve_block_lane: 'accumulating' | 'block_ready' | 'sealing' | 'sealed_blocks';
  fountain_lane: VaultFountainLaneStatus;
  headline: string;
  canon: string;
};

export function computeReserveBlockSummary(args: {
  v1BalanceReserve: number;
  inProgressBalance: number;
  sealsCountAttested: number;
  sealsAuditCount: number;
}): ReserveBlockSummary {
  const block_size = VAULT_RESERVE_PARCEL_UNITS;
  const safeV1 = Number.isFinite(args.v1BalanceReserve) ? Math.max(0, args.v1BalanceReserve) : 0;
  const safeProgress = Number.isFinite(args.inProgressBalance) ? Math.max(0, args.inProgressBalance) : 0;
  const completed_blocks_v1 = Math.floor(safeV1 / block_size);
  const sealed_blocks = Math.max(0, Math.floor(args.sealsCountAttested));
  const audit_blocks = Math.max(0, Math.floor(args.sealsAuditCount));
  const in_progress_block = Math.max(sealed_blocks, audit_blocks, completed_blocks_v1) + 1;
  const in_progress_balance = Number((safeProgress % block_size).toFixed(6));
  const in_progress_pct = block_size > 0 ? Math.min(100, Math.round((in_progress_balance / block_size) * 100)) : 0;
  const remaining_to_next_block = Number(Math.max(0, block_size - in_progress_balance).toFixed(6));

  return {
    block_size,
    sealed_blocks,
    audit_blocks,
    completed_blocks_v1,
    in_progress_block,
    in_progress_balance,
    in_progress_pct,
    remaining_to_next_block,
    label: `Block ${in_progress_block} in progress — ${in_progress_balance.toFixed(2)} / ${block_size.toFixed(0)} MIC (${in_progress_pct}%)`,
    canon: 'One Reserve Block equals one 50-unit reserve parcel. Blocks can seal before the Fountain unlocks.',
  };
}

export function computeVaultSealLaneSemantics(args: {
  v1BalanceReserve?: number;
  inProgressBalance: number;
  sealsCountAttested: number;
  sealsAuditCount?: number;
  giCurrent: number | null;
  giThreshold: number;
  sustainCyclesRequired: number;
  v1Status: 'sealed' | 'preview' | 'activating';
  candidateInFlight: boolean;
}): VaultSealOneSemantics {
  const reserve_threshold = VAULT_RESERVE_PARCEL_UNITS;
  const sealed_reserve_total = args.sealsCountAttested * reserve_threshold;
  const current_tranche_balance = args.inProgressBalance;
  const carry_forward_in_tranche = current_tranche_balance;
  const reserve_block = computeReserveBlockSummary({
    v1BalanceReserve: args.v1BalanceReserve ?? sealed_reserve_total + current_tranche_balance,
    inProgressBalance: current_tranche_balance,
    sealsCountAttested: args.sealsCountAttested,
    sealsAuditCount: args.sealsAuditCount ?? args.sealsCountAttested,
  });

  const gi = args.giCurrent;
  const gi_threshold_met = gi !== null && Number.isFinite(gi) && gi >= args.giThreshold;
  const reserve_threshold_met = current_tranche_balance >= reserve_threshold;

  let fountain_lane: VaultFountainLaneStatus = 'locked';
  if (args.v1Status === 'activating') fountain_lane = 'active';
  else if (args.v1Status === 'preview') fountain_lane = 'preview';
  else if (gi_threshold_met) fountain_lane = 'tracking';

  let reserve_block_lane: VaultSealOneSemantics['reserve_block_lane'] = 'accumulating';
  let reserve_lane: VaultReserveLaneStatus = 'accumulating';
  if (args.candidateInFlight) {
    reserve_block_lane = 'sealing';
    reserve_lane = 'sealing';
  } else if (reserve_threshold_met) {
    reserve_block_lane = 'block_ready';
    reserve_lane = 'tranche_ready';
  } else if (args.sealsCountAttested > 0) {
    reserve_block_lane = 'sealed_blocks';
    reserve_lane = 'sealed_tranches';
  }

  const headline = (() => {
    if (args.candidateInFlight) return 'Reserve Block sealing in progress (council attestation)';
    if (reserve_block.sealed_blocks >= 1) {
      return reserve_block.sealed_blocks === 1 ? 'Block 1 sealed — reserve proof attested' : `${reserve_block.sealed_blocks} Reserve Blocks sealed`;
    }
    if (reserve_threshold_met) return `Reserve Block ${reserve_block.in_progress_block} ready to seal (50 MIC)`;
    return reserve_block.label;
  })();

  return {
    sealed_reserve_total: Number(sealed_reserve_total.toFixed(2)),
    current_tranche_balance: Number(current_tranche_balance.toFixed(6)),
    carry_forward_in_tranche: Number(carry_forward_in_tranche.toFixed(6)),
    reserve_threshold,
    reserve_threshold_met,
    reserve_block,
    gi_threshold: args.giThreshold,
    gi_threshold_met,
    sustain_cycles_required: args.sustainCyclesRequired,
    sustain_met: false,
    vault_status: args.v1Status,
    reserve_lane,
    reserve_block_lane,
    fountain_lane,
    headline,
    canon: reserve_block.canon,
  };
}
