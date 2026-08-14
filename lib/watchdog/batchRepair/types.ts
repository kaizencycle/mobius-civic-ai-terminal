import type { SealCollisionResolutionReceipt } from '@/lib/watchdog/reconciliationReceipt';

export const BATCH_MANIFEST_SCHEMA_VERSION = '1.0' as const;

export const TRACK_R_BATCH_REPAIR_ID = 'track-r-c403-batch-001' as const;
export const TRACK_R_BATCH_CYCLE = 'C-403' as const;
export const TRACK_R_STRATEGY = 'component_coherent_hybrid' as const;

export const TRACK_R_TOTAL_BLOCK_POSITIONS = 194 as const;
export const TRACK_R_CONTESTED_POSITIONS = 123 as const;
export const TRACK_R_HISTORICAL_CONFLICT_PAIRS = 125 as const;
export const TRACK_R_CANONICAL_ASSIGNMENT_COUNT = 123 as const;
export const TRACK_R_QUARANTINED_CONFLICTING_SEALS = 125 as const;
export const TRACK_R_CLEAN_POSITION_COUNT = 71 as const;

export type BatchVerdict = 'pending' | 'approved' | 'challenged' | 'rejected';

export type BoundaryExpectation = 'must_pass' | 'pending_track_r_step_8';

export type CollisionRepairBatchManifest = {
  schema_version: typeof BATCH_MANIFEST_SCHEMA_VERSION;
  repair_id: string;
  cycle: string;
  strategy: typeof TRACK_R_STRATEGY;
  source_audit_hash: string;
  resolution_table_hash: string;
  total_block_positions: typeof TRACK_R_TOTAL_BLOCK_POSITIONS;
  contested_positions: typeof TRACK_R_CONTESTED_POSITIONS;
  historical_hash_divergent_pairs: typeof TRACK_R_HISTORICAL_CONFLICT_PAIRS;
  canonical_assignment_count: typeof TRACK_R_CANONICAL_ASSIGNMENT_COUNT;
  quarantined_conflicting_seal_count: typeof TRACK_R_QUARANTINED_CONFLICTING_SEALS;
  clean_position_count: typeof TRACK_R_CLEAN_POSITION_COUNT;
  receipts: SealCollisionResolutionReceipt[];
  canonical_assignments: Record<string, string>;
  quarantined_seal_ids: string[];
  boundary_expectations: {
    '41->42': BoundaryExpectation;
    '131->132': BoundaryExpectation;
  };
  production_execution_enabled: false;
  zeus_verdict: BatchVerdict;
  eve_verdict: BatchVerdict;
  human_approval: BatchVerdict;
  created_at: string;
  manifest_hash: string;
};

export type BatchAdjudicationMetrics = {
  historical_hash_divergent_pair_count: number;
  adjudicated_collision_positions: number;
  unresolved_collision_positions: number;
  canonical_assignment_count: number;
  quarantined_witness_count: number;
  original_seals_deleted: number;
  clean_positions_modified: number;
  boundary_41_42: 'pass' | 'fail' | 'pending_track_r_step_8';
  boundary_131_132: 'pass' | 'pending_track_r_step_8';
};

export type StagedLineageView = {
  repair_id: string;
  version_keys: {
    manifest: string;
    canonical: string;
    quarantine: string;
  };
  total_block_positions: number;
  contested_assignments: Record<string, string>;
  clean_positions: number[];
  quarantined_seal_ids: string[];
  derived_latest_canonical_seal_id: string | null;
};

export type RollbackPlan = {
  repair_id: string;
  previous_active_version: string | null;
  restore: {
    active_lineage_version: string | null;
    latest_pointer: string | null;
    canonical_map_selection: 'prior_active_version';
    quarantine_view: 'prior_active_version';
  };
  preserves: string[];
  journals_required: boolean;
};

export type BatchDryRunReport = {
  repair_id: string;
  cycle: string;
  dry_run: true;
  manifest_hash: string;
  writes_performed: 0;
  metrics: BatchAdjudicationMetrics;
  staged: StagedLineageView;
  rollback_plan: RollbackPlan;
  idempotent: boolean;
};

export type BatchCommitGuardInput = {
  manifest: CollisionRepairBatchManifest;
  dry_run: boolean;
  execution_feature_flag_enabled: boolean;
  explicit_operator_command: boolean;
  approved_manifest_hash?: string;
  fresh_kv_snapshot_matches: boolean;
  integrity_gate_active: boolean;
  mutation_journal_available: boolean;
  rollback_plan_verified: boolean;
};
