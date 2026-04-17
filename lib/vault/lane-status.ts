/**
 * Operator-facing Vault lane labels: reserve tranche sealing vs Fountain / integrity.
 * See docs/protocols/vault-seal-i.md (Seal the tranche, not the history).
 */

import { VAULT_RESERVE_PARCEL_UNITS } from '@/lib/vault-v2/constants';

export type VaultFountainLaneStatus = 'locked' | 'preview' | 'tracking' | 'unsealed' | 'active';

export type VaultReserveLaneStatus = 'accumulating' | 'tranche_ready' | 'sealing' | 'sealed_tranches';

export type VaultSealOneSemantics = {
  /** Sum of completed v2 attested reserve parcels (50-unit tranches). */
  sealed_reserve_total: number;
  /** Canonical forming tranche progress (v2 in_progress_balance). */
  current_tranche_balance: number;
  /** Same as current_tranche_balance for spec wording. */
  carry_forward_in_tranche: number;
  reserve_threshold: number;
  reserve_threshold_met: boolean;
  gi_threshold: number;
  gi_threshold_met: boolean;
  sustain_cycles_required: number;
  /** Placeholder until sustain is tracked in KV; always false for now. */
  sustain_met: boolean;
  /** v1 payload status: sealed | preview | activating */
  vault_status: 'sealed' | 'preview' | 'activating';
  /** Reserve tranche lifecycle for UI. */
  reserve_lane: VaultReserveLaneStatus;
  /** Fountain / integrity gate for UI — not the same as reserve seal. */
  fountain_lane: VaultFountainLaneStatus;
  /** Human-readable headline (e.g. Seal I achieved). */
  headline: string;
  /** Short operator line. */
  canon: string;
};

export function computeVaultSealLaneSemantics(args: {
  inProgressBalance: number;
  sealsCountAttested: number;
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

  const gi = args.giCurrent;
  const gi_threshold_met = gi !== null && Number.isFinite(gi) && gi >= args.giThreshold;
  const reserve_threshold_met = current_tranche_balance >= reserve_threshold;

  let fountain_lane: VaultFountainLaneStatus = 'locked';
  if (args.v1Status === 'activating') fountain_lane = 'active';
  else if (args.v1Status === 'preview') fountain_lane = 'preview';
  else if (gi_threshold_met) fountain_lane = 'tracking';

  let reserve_lane: VaultReserveLaneStatus = 'accumulating';
  if (args.candidateInFlight) {
    reserve_lane = 'sealing';
  } else if (reserve_threshold_met) {
    reserve_lane = 'tranche_ready';
  } else if (args.sealsCountAttested > 0) {
    reserve_lane = 'sealed_tranches';
  }

  const sealOrdinal = args.sealsCountAttested;
  const headline = (() => {
    if (args.candidateInFlight) {
      return 'Reserve tranche sealing in progress (council attestation)';
    }
    if (sealOrdinal >= 1) {
      return sealOrdinal === 1
        ? 'Seal I achieved — reserve tranche sealed'
        : `Seal ${sealOrdinal} achieved — reserve tranche sealed`;
    }
    if (reserve_threshold_met) {
      return 'Reserve tranche ready to seal (50 units)';
    }
    return 'Reserve accumulating toward first tranche';
  })();

  return {
    sealed_reserve_total: Number(sealed_reserve_total.toFixed(2)),
    current_tranche_balance: Number(current_tranche_balance.toFixed(6)),
    carry_forward_in_tranche: Number(carry_forward_in_tranche.toFixed(6)),
    reserve_threshold,
    reserve_threshold_met,
    gi_threshold: args.giThreshold,
    gi_threshold_met,
    sustain_cycles_required: args.sustainCyclesRequired,
    sustain_met: false,
    vault_status: args.v1Status,
    reserve_lane,
    fountain_lane,
    headline,
    canon: 'Reserve can be sealed before integrity unseals the Fountain.',
  };
}
