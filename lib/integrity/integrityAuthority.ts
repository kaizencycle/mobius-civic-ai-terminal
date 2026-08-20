/**
 * C-409 — single-source integrity authority and degraded propagation.
 *
 * Presentation endpoints must not weaken upstream degraded warnings.
 * Green numeric GI alone does not imply healthy authority.
 */

import type { VerificationStatusLabel } from '@/lib/mic/quorumSemantics';
import type { GovernanceStateLabel } from '@/lib/integrity/operationalState';

export type IntegrityAuthorityInput = {
  /** GI chain / carry / stale tier degraded signal. */
  giDegraded: boolean;
  /** Lane-level KV continuity. */
  kvOk: boolean;
  /** GI value resolved for the surface. */
  integrityLaneOk: boolean;
  /** Lane freshness bucket (snapshot-lite). */
  integrityFreshnessDegraded?: boolean;
  /** Band-derived mode string. */
  mode: string | null;
  /** Runtime tripwire elevated. */
  tripwireElevated: boolean;
  /** Render GIC indexer configured. */
  gicAvailable: boolean;
  /** Render GIC fetch failed when configured. */
  gicFetchFailed?: boolean;
  /** Latest ZEUS catalog verification posture. */
  zeusVerificationStatus: VerificationStatusLabel;
  /** Operational governance posture. */
  governanceState?: GovernanceStateLabel;
  /** Explicit upstream degraded — always preserved (rule 1). */
  upstreamDegraded?: boolean;
};

export type IntegrityAuthorityBlock = {
  kv_backed: boolean;
  gi_origin: string;
  degraded: boolean;
  gic_available: boolean;
  zeus_verification_status: VerificationStatusLabel;
  note: string;
};

export function resolveIntegrityDegraded(input: IntegrityAuthorityInput): boolean {
  if (input.upstreamDegraded === true) return true;

  return (
    input.giDegraded ||
    !input.kvOk ||
    !input.integrityLaneOk ||
    input.integrityFreshnessDegraded === true ||
    input.mode === 'red' ||
    input.tripwireElevated ||
    !input.gicAvailable ||
    input.gicFetchFailed === true ||
    input.zeusVerificationStatus === 'unknown' ||
    input.zeusVerificationStatus === 'disputed' ||
    input.zeusVerificationStatus === 'blocked' ||
    input.governanceState === 'disputed' ||
    input.governanceState === 'unknown'
  );
}

export function buildIntegrityAuthorityBlock(args: {
  persistenceSource: string;
  kvBacked: boolean;
  renderUsed: boolean;
  gicAvailable: boolean;
  zeusVerificationStatus: VerificationStatusLabel;
  degraded: boolean;
}): IntegrityAuthorityBlock {
  const gi_origin = args.renderUsed ? 'gic-indexer' : args.persistenceSource;
  const note =
    args.persistenceSource === 'kv'
      ? 'Primary GI is being served from KV-backed state.'
      : args.persistenceSource === 'live'
        ? 'GI is being computed from live in-process signals.'
        : args.persistenceSource === 'gic-indexer'
          ? 'GI is being served from Render GIC indexer.'
          : !args.gicAvailable
            ? 'Render GIC indexer unavailable — authority remains degraded until configured.'
            : 'GI is operating under degraded signal authority.';

  return {
    kv_backed: args.kvBacked,
    gi_origin,
    degraded: args.degraded,
    gic_available: args.gicAvailable,
    zeus_verification_status: args.zeusVerificationStatus,
    note,
  };
}
