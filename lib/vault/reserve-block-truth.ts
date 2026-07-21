/**
 * C-376 — Reserve Block truth surface.
 *
 * Separates Vault seal-index cardinality from reconciled canonical Reserve Blocks.
 * Canonical count is independent of SEAL_INTEGRITY_GATE state — gate controls
 * formation permission, not historical lineage adjudication.
 *
 * Canon → Ledger → UI: UI must not derive canon from vault index cardinality.
 */

import type { CollisionAffectedBlockSnapshot } from '@/lib/vault/collision-affected-blocks';
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
  | 'formation_allowed'
  | 'threshold_met_ready';

export type CanonicalCountStatus = 'resolved' | 'unresolved' | 'unverified';

export type HistoricalEraRecordStatus =
  | 'verified'
  | 'verified_historical_era'
  | 'unverified'
  | 'reconciliation_pending'
  | 'unknown';

export type HistoricalEraRecordClass = {
  count: number | null;
  status: HistoricalEraRecordStatus;
  note?: string;
};

export type HistoricalEraBreakdown = {
  pre_canon_records: HistoricalEraRecordClass;
  legacy_tranche_records: HistoricalEraRecordClass;
  modern_reserve_block_records: HistoricalEraRecordClass;
  alternate_or_collision_records: HistoricalEraRecordClass;
};

/** Reconciled canonical evidence — never inferred from vault index cardinality. */
export type CanonicalCountEvidence = {
  reconciled_block_count: number;
  latest_canonical_seal_id?: string | null;
  source: string;
};

export type ReserveBlockTruthSurface = {
  /** Vault attested seal-index cardinality (not canonical block count). */
  vault_index_records: number;
  /** Full audit index cardinality (attested + quarantined + rejected). */
  vault_audit_index_records: number;
  attested_records_examined: number;
  collision_pair_count: number | null;
  /** Read-only audit artifact; null when operator has not published affected-block set. */
  collision_affected_blocks: CollisionAffectedBlockSnapshot | null;
  canonical_reserve_blocks: number | null;
  canonical_count_status: CanonicalCountStatus;
  /** @deprecated Use canonical_count_status — retained for one-cycle API compat. */
  canonical_lineage_status: 'reconciled' | 'unresolved_pending_reconciliation' | 'unknown';
  /** @deprecated Use vault_index_records */
  vault_seal_index_count: number;
  /** @deprecated Use vault_audit_index_records */
  vault_audit_index_count: number;
  /** @deprecated Use attested_records_examined */
  attested_seals_examined: number;
  historical_era_breakdown: HistoricalEraBreakdown;
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
  deposit_activity_status: 'active' | 'degraded' | 'suspended';
  accumulator: {
    operational_slot_projected: number;
    /** @deprecated Use operational_slot_projected */
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

const PROJECTION_NOTE =
  'Operational projected slot from max(seal index, audit index, v1 parcels) + 1 — not a constitutionally adjudicated Reserve Block number until canonical sequencing is restored.';

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

/** Collision pairs from watchdog findings (live report or stale-alert fallback). */
export function extractCollisionPairCount(findings?: KvWatchdogFinding[] | null): number | null {
  if (!findings?.length) return null;
  return collisionPairCountFromFindings(findings);
}

export type DepositActivityEvidence = {
  primary_kv_suspended: boolean;
  kv_reads_ok: boolean;
};

export function deriveDepositActivity(evidence: DepositActivityEvidence): {
  deposits_active: boolean;
  deposit_activity_status: ReserveBlockTruthSurface['deposit_activity_status'];
} {
  if (evidence.primary_kv_suspended) {
    return { deposits_active: false, deposit_activity_status: 'suspended' };
  }
  if (!evidence.kv_reads_ok) {
    return { deposits_active: false, deposit_activity_status: 'degraded' };
  }
  return { deposits_active: true, deposit_activity_status: 'active' };
}

function buildOperatorSummary(args: {
  deposits_active: boolean;
  deposit_activity_status: ReserveBlockTruthSurface['deposit_activity_status'];
  sealing_suspended: boolean;
  reserve_threshold_met: boolean;
}): string {
  if (!args.deposits_active) {
    if (args.deposit_activity_status === 'suspended') {
      return 'Primary KV suspended — deposits not durably recording · verify watchdog / Upstash health';
    }
    return 'Deposit write path degraded — verify KV connectivity before trusting accumulator';
  }
  if (args.sealing_suspended) {
    return 'Deposits active · sealing suspended pending lineage reconciliation';
  }
  if (args.reserve_threshold_met) {
    return 'Deposits active · formation permitted · canonical count requires reconciled evidence';
  }
  return 'Deposits active · accumulator advancing';
}

export function resolveCanonicalReserveBlockCount(evidence: CanonicalCountEvidence | null | undefined): {
  count: number | null;
  status: CanonicalCountStatus;
  latest_canonical_seal_id: string | null;
} {
  if (
    evidence &&
    Number.isFinite(evidence.reconciled_block_count) &&
    evidence.reconciled_block_count >= 0 &&
    evidence.source.trim().length > 0
  ) {
    return {
      count: evidence.reconciled_block_count,
      status: 'resolved',
      latest_canonical_seal_id: evidence.latest_canonical_seal_id ?? null,
    };
  }
  return {
    count: null,
    status: 'unresolved',
    latest_canonical_seal_id: null,
  };
}

export function computeHistoricalEraBreakdown(args: {
  collision_pair_count: number | null;
  canonical_count_status: CanonicalCountStatus;
}): HistoricalEraBreakdown {
  const lineageUnresolved = args.canonical_count_status !== 'resolved';
  const collisionsPresent = args.collision_pair_count != null && args.collision_pair_count > 0;

  return {
    pre_canon_records: {
      count: null,
      status: 'unverified',
      note: 'C-288–C-298 per-cycle genesis records; classified counts require dedicated scan',
    },
    legacy_tranche_records: {
      count: null,
      status: 'verified_historical_era',
      note: 'C-299–C-307 MIC tranche lineage (seal-C-299-001 → seal-C-307-041 continuity previously verified)',
    },
    modern_reserve_block_records: {
      count: null,
      status: lineageUnresolved || collisionsPresent ? 'reconciliation_pending' : 'unverified',
      note: 'C-308+ Reserve Block era; canonical count requires reconciled evidence, not vault index cardinality',
    },
    alternate_or_collision_records: {
      count: null,
      status: collisionsPresent ? 'reconciliation_pending' : 'unverified',
      note: collisionsPresent
        ? `${args.collision_pair_count} hash-divergent collision pair(s) detected in attested KV`
        : 'Alternate lineage records require collision audit classification',
    },
  };
}

function legacyLineageStatus(
  status: CanonicalCountStatus,
): ReserveBlockTruthSurface['canonical_lineage_status'] {
  switch (status) {
    case 'resolved':
      return 'reconciled';
    case 'unresolved':
      return 'unresolved_pending_reconciliation';
    case 'unverified':
      return 'unknown';
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
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
  canonical_evidence?: CanonicalCountEvidence | null;
  deposit_activity: DepositActivityEvidence;
  collision_affected_blocks?: CollisionAffectedBlockSnapshot | null;
}): ReserveBlockTruthSurface {
  const gate = args.seal_integrity_gate;
  const sealing_suspended = gate.enabled && gate.active;
  const hard_stop_enabled = sealing_suspended;
  const candidate_formation_blocked = sealing_suspended;
  const { deposits_active, deposit_activity_status } = deriveDepositActivity(args.deposit_activity);

  const canonical = resolveCanonicalReserveBlockCount(args.canonical_evidence);
  const canonical_reserve_blocks = canonical.count;
  const canonical_count_status = canonical.status;
  const historical_era_breakdown = computeHistoricalEraBreakdown({
    collision_pair_count: args.collision_pair_count,
    canonical_count_status,
  });

  let formation_status: ReserveBlockFormationStatus;
  if (args.candidate_in_flight) {
    formation_status = 'sealing';
  } else if (sealing_suspended) {
    formation_status = 'integrity_hold';
  } else if (args.reserve_threshold_met) {
    formation_status = 'threshold_met_ready';
  } else if (args.vault_seal_index_count > 0) {
    formation_status = 'formation_allowed';
  } else {
    formation_status = 'accumulating';
  }

  const operator_summary = buildOperatorSummary({
    deposits_active,
    deposit_activity_status,
    sealing_suspended,
    reserve_threshold_met: args.reserve_threshold_met,
  });

  const slot = args.reserve_block.in_progress_block;
  const headline = (() => {
    if (!deposits_active) {
      if (deposit_activity_status === 'suspended') {
        return `KV suspended — accumulator reads may be stale · ${args.reserve_block.label}`;
      }
      return `Deposit path degraded — verify KV before trusting accumulator · ${args.reserve_block.label}`;
    }
    if (sealing_suspended) {
      const collision =
        args.collision_pair_count != null ? ` · ${args.collision_pair_count} collision pair(s)` : '';
      return `Integrity hold — ${args.reserve_block.label}${collision} · sealing suspended pending lineage reconciliation`;
    }
    if (args.candidate_in_flight) {
      return 'Reserve Block sealing in progress (council attestation)';
    }
    if (canonical_reserve_blocks != null) {
      return canonical_reserve_blocks === 1
        ? '1 reconciled canonical Reserve Block (adjudicated continuity)'
        : `${canonical_reserve_blocks} reconciled canonical Reserve Blocks (adjudicated continuity)`;
    }
    if (args.vault_seal_index_count >= 1) {
      return `${args.vault_seal_index_count} vault index records · canonical Reserve Block count reconciliation pending`;
    }
    if (args.reserve_threshold_met) {
      return `Projected accumulator slot ${slot} at threshold — ready to seal when formation permitted`;
    }
    return args.reserve_block.label;
  })();

  return {
    vault_index_records: args.vault_seal_index_count,
    vault_audit_index_records: args.vault_audit_index_count,
    attested_records_examined: args.attestation_coverage.examined,
    collision_pair_count: args.collision_pair_count,
    collision_affected_blocks: args.collision_affected_blocks ?? null,
    canonical_reserve_blocks,
    canonical_count_status,
    canonical_lineage_status: legacyLineageStatus(canonical_count_status),
    vault_seal_index_count: args.vault_seal_index_count,
    vault_audit_index_count: args.vault_audit_index_count,
    attested_seals_examined: args.attestation_coverage.examined,
    historical_era_breakdown,
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
    deposit_activity_status,
    accumulator: {
      operational_slot_projected: slot,
      in_progress_block_projected: slot,
      in_progress_balance: args.reserve_block.in_progress_balance,
      block_size: args.reserve_block.block_size,
      in_progress_pct: args.reserve_block.in_progress_pct,
      remaining_to_next_block: args.reserve_block.remaining_to_next_block,
      projection_note: PROJECTION_NOTE,
      candidate_formation_blocked,
    },
    formation_status,
    latest_canonical_seal_id: canonical.latest_canonical_seal_id,
    headline,
    operator_summary,
  };
}
