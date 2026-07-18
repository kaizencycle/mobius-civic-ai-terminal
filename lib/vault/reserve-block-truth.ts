/**
 * C-376 — Reserve Block truth surface.
 *
 * Separates Vault seal-index cardinality from reconciled canonical Reserve Blocks.
 * When the seal integrity gate is engaged, deposits continue but candidate formation
 * and pass/finalization are fail-closed pending lineage reconciliation (Track R).
 */

import type { AttestationCoverage } from '@/lib/vault/attestation-coverage';
import type { ReserveBlockSummary } from '@/lib/vault/lane-status';
import {
  findCriticalCollisionFindings,
  type SealIntegrityGateState,
} from '@/lib/watchdog/sealIntegrityGate';
import type { KvWatchdogFinding } from '@/lib/watchdog/kvHealthChecks';

export type ReserveBlockFormationStatus =
  | 'accumulating'
  | 'sealing'
  | 'integrity_hold'
  | 'threshold_met_ready'
  | 'sealed_index_only';

export type ReserveBlockTruthSurface = {
  vault_seal_index_count: number;
  vault_audit_index_count: number;
  attested_seals_examined: number;
  collision_pair_count: number | null;
  canonical_reserve_blocks: number | null;
  canonical_lineage_status: 'reconciled' | 'unresolved_pending_reconciliation' | 'unknown';
  integrity_gate: {
    enabled: boolean;
    active: boolean;
    hard_stop_enabled: boolean;
    sealing_suspended: boolean;
    reasons: string[];
    source: SealIntegrityGateState['source'];
    operator_cycle: string | null;
  };
  deposits_active: boolean;
  accumulator: {
    in_progress_block_projected: number;
    in_progress_balance: number;
    block_size: number;
    in_progress_pct: number;
    remaining_to_next_block: number;
    projection_note: string;
    candidate_formation_blocked: boolean;
  };
  formation_status: ReserveBlockFormationStatus;
  latest_canonical_seal_id: string | null;
  headline: string;
  operator_summary: string;
};

function collisionPairCountFromFindings(findings: KvWatchdogFinding[]): number | null {
  const critical = findCriticalCollisionFindings(findings);
  if (critical.length === 0) return null;
  const evidence = critical[0]?.evidence;
  if (evidence && typeof evidence.hash_divergent_collisions === 'number') {
    return evidence.hash_divergent_collisions;
  }
  if (evidence && typeof evidence.collision_count === 'number') {
    return evidence.collision_count;
  }
  return critical.length;
}

export function extractCollisionPairCount(
  gate: SealIntegrityGateState,
  liveFindings?: KvWatchdogFinding[] | null,
): number | null {
  if (!gate.active) return null;
  if (liveFindings?.length) {
    return collisionPairCountFromFindings(liveFindings);
  }
  return gate.reasons.length > 0 ? null : null;
}

export function computeReserveBlockTruthSurface(args: {
  reserve_block: ReserveBlockSummary;
  vault_seal_index_count: number;
  vault_audit_index_count: number;
  attestation_coverage: AttestationCoverage;
  seal_integrity_gate: SealIntegrityGateState;
  collision_pair_count: number | null;
  candidate_in_flight: boolean;
  reserve_threshold_met: boolean;
  latest_seal_id: string | null;
  latest_canonical_seal_id?: string | null;
}): ReserveBlockTruthSurface {
  const gate = args.seal_integrity_gate;
  const sealing_suspended = gate.enabled && gate.active;
  const hard_stop_enabled = sealing_suspended;
  const candidate_formation_blocked = sealing_suspended;
  const deposits_active = true;

  const canonical_lineage_status: ReserveBlockTruthSurface['canonical_lineage_status'] =
    sealing_suspended || (args.collision_pair_count != null && args.collision_pair_count > 0)
      ? 'unresolved_pending_reconciliation'
      : args.collision_pair_count === 0
        ? 'reconciled'
        : !sealing_suspended
          ? 'reconciled'
          : 'unknown';

  const canonical_reserve_blocks =
    canonical_lineage_status === 'reconciled' ? args.vault_seal_index_count : null;

  let formation_status: ReserveBlockFormationStatus;
  if (args.candidate_in_flight) {
    formation_status = 'sealing';
  } else if (sealing_suspended) {
    formation_status = 'integrity_hold';
  } else if (args.reserve_threshold_met) {
    formation_status = 'threshold_met_ready';
  } else if (args.vault_seal_index_count > 0) {
    formation_status = 'sealed_index_only';
  } else {
    formation_status = 'accumulating';
  }

  const operator_summary = sealing_suspended
    ? 'Deposits active · sealing suspended pending lineage reconciliation'
    : args.reserve_threshold_met
      ? 'Deposits active · Reserve Block ready to seal'
      : 'Deposits active · accumulator advancing';

  const headline = (() => {
    if (sealing_suspended) {
      const collision =
        args.collision_pair_count != null
          ? ` · ${args.collision_pair_count} collision pair(s)`
          : '';
      return (
        `Integrity hold — ${args.reserve_block.label}${collision} · sealing suspended pending lineage reconciliation`
      );
    }
    if (args.candidate_in_flight) {
      return 'Reserve Block sealing in progress (council attestation)';
    }
    if (args.vault_seal_index_count >= 1 && canonical_reserve_blocks != null) {
      return args.vault_seal_index_count === 1
        ? 'Block 1 sealed — reserve proof attested'
        : `${args.vault_seal_index_count} Reserve Blocks sealed`;
    }
    if (args.reserve_threshold_met) {
      return `Reserve Block ${args.reserve_block.in_progress_block} ready to seal (50 MIC)`;
    }
    return args.reserve_block.label;
  })();

  return {
    vault_seal_index_count: args.vault_seal_index_count,
    vault_audit_index_count: args.vault_audit_index_count,
    attested_seals_examined: args.attestation_coverage.examined,
    collision_pair_count: args.collision_pair_count,
    canonical_reserve_blocks,
    canonical_lineage_status,
    integrity_gate: {
      enabled: gate.enabled,
      active: gate.active,
      hard_stop_enabled,
      sealing_suspended,
      reasons: gate.reasons,
      source: gate.source,
      operator_cycle: gate.operator_cycle,
    },
    deposits_active,
    accumulator: {
      in_progress_block_projected: args.reserve_block.in_progress_block,
      in_progress_balance: args.reserve_block.in_progress_balance,
      block_size: args.reserve_block.block_size,
      in_progress_pct: args.reserve_block.in_progress_pct,
      remaining_to_next_block: args.reserve_block.remaining_to_next_block,
      projection_note:
        'Projected from max(seal index, audit index, v1 parcels) + 1 — not a reconciled canonical block number while integrity gate is engaged.',
      candidate_formation_blocked,
    },
    formation_status,
    latest_canonical_seal_id: args.latest_canonical_seal_id ?? args.latest_seal_id,
    headline,
    operator_summary,
  };
}
