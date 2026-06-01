// C-329 — make the silent attestation failure VISIBLE.
//
// PROBLEM (observed live at /api/vault/status, C-329):
//   status: "sealed", vault_headline: "173 Reserve Blocks sealed"
//   substrate_attestation_id: null
//   substrate_attestation_error: 'ledger 400: {"detail":"No API base configured for terminal"}'
//
//   The vault reported 173 blocks "sealed" while 0 were substrate-attested.
//   The only error surfaced was for the single latest seal. The status route
//   never computed how many of the N sealed blocks were actually immortalized
//   in Substrate. This is the "silent attestation failure" Priority A forbids.
//
// Scope: does NOT fix the ledger 400 (that is a Civic-Protocol-Core contract
// issue). Ensures the failure can never again be invisible.

import type { Seal } from '@/lib/vault-v2/types';

export type AttestationCoverage = {
  /** Seals examined (capped by the caller's scan limit). */
  examined: number;
  /** Seals with both substrate_attestation_id AND substrate_event_hash (truly immortalized). */
  immortalized: number;
  /** Seals carrying a substrate_attestation_error. */
  errored: number;
  /** Seals that are sealed locally but neither immortalized nor errored (pending/never-attempted). */
  unattested: number;
  /** immortalized / examined, 0..1. Null when nothing examined. */
  coverage_ratio: number | null;
  /** True when at least one seal is sealed-but-not-immortalized. */
  has_gap: boolean;
  /** Most recent distinct attestation error string seen, or null. */
  latest_error: string | null;
  /** Cycle range over which the gap spans, e.g. "C-310 → C-329", or null. */
  gap_cycle_range: string | null;
};

function isImmortalized(seal: Seal): boolean {
  return Boolean(seal.substrate_attestation_id && seal.substrate_event_hash);
}

/**
 * Compute substrate-attestation coverage over a set of seals.
 * Pure function — caller supplies the seals (e.g. from listAllSeals).
 */
export function computeAttestationCoverage(seals: Seal[]): AttestationCoverage {
  const examined = seals.length;
  if (examined === 0) {
    return {
      examined: 0,
      immortalized: 0,
      errored: 0,
      unattested: 0,
      coverage_ratio: null,
      has_gap: false,
      latest_error: null,
      gap_cycle_range: null,
    };
  }

  let immortalized = 0;
  let errored = 0;
  let unattested = 0;
  let latest_error: string | null = null;
  const gapCycles: string[] = [];

  for (const seal of seals) {
    if (isImmortalized(seal)) {
      immortalized += 1;
      continue;
    }
    if (seal.substrate_attestation_error) {
      errored += 1;
      if (!latest_error) latest_error = seal.substrate_attestation_error;
    } else {
      unattested += 1;
    }
    if (seal.cycle_at_seal) gapCycles.push(seal.cycle_at_seal);
  }

  const has_gap = immortalized < examined;
  const coverage_ratio = Number((immortalized / examined).toFixed(4));

  let gap_cycle_range: string | null = null;
  if (gapCycles.length > 0) {
    const sorted = [...gapCycles].sort((a, b) => cycleNum(a) - cycleNum(b));
    const lo = sorted[0];
    const hi = sorted[sorted.length - 1];
    gap_cycle_range = lo === hi ? lo : `${lo} → ${hi}`;
  }

  return {
    examined,
    immortalized,
    errored,
    unattested,
    coverage_ratio,
    has_gap,
    latest_error,
    gap_cycle_range,
  };
}

function cycleNum(cycle: string): number {
  const m = /(\d+)/.exec(cycle);
  return m ? Number(m[1]) : 0;
}

/**
 * Honest headline suffix describing attestation reality.
 * Returns '' when fully immortalized (no suffix needed).
 */
export function attestationHeadlineSuffix(cov: AttestationCoverage): string {
  if (cov.examined === 0) return '';
  if (!cov.has_gap) return '';
  if (cov.immortalized === 0) {
    return ` · ⚠ 0 attested to Substrate (${cov.errored} errored)`;
  }
  return ` · ⚠ ${cov.immortalized}/${cov.examined} attested to Substrate`;
}
