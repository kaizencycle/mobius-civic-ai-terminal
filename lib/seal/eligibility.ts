import type { TrancheState } from '@/lib/seal/types';

export function isSealEligible(tranche: TrancheState) {
  const remaining = Math.max(0, tranche.target_units - tranche.current_units);

  return {
    eligible: !tranche.sealed && tranche.current_units >= tranche.target_units,
    remaining,
  };
}
