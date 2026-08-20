/**
 * C-409 — read-only Track R P3 intake observability.
 *
 * Never issues ADOPT, never authorizes execution, never synthesizes verdicts.
 */

import { kvGet } from '@/lib/kv/store';
import {
  findPacketReviewEntry,
  loadPacketReviewRegistry,
  type PacketReviewRegistryEntry,
} from '@/lib/watchdog/batchRepair/p3PacketReviewRegistry';
import {
  loadIssuedPacketRegistry,
  type IssuedPacketRegistryEntry,
} from '@/lib/watchdog/batchRepair/p3IssuedPacketRegistry';
import {
  TRACK_R_P3_REVIEW_REGISTRY_KV_KEY,
  trackRP3ReviewReceiptKvKey,
  type TrackRP3ReviewReceiptRecord,
} from '@/lib/watchdog/batchRepair/trackRP3ReviewStateStore';
import type { TrackRP3ReviewLane } from '@/lib/watchdog/batchRepair/trackRP3ReviewArtifacts';

export type TrackRP3OperatorIntakeState =
  | 'NOT_SEEN'
  | 'INTAKE_VERIFIED'
  | 'AWAITING_INDEPENDENT_REVIEW'
  | 'REVIEW_IN_PROGRESS'
  | 'BLOCKED'
  | 'SUPERSEDED';

export type TrackRP3ReviewLaneStatus = {
  lane: TrackRP3ReviewLane;
  intake_state: TrackRP3OperatorIntakeState;
  review_status: PacketReviewRegistryEntry['zeus_review_status'] | PacketReviewRegistryEntry['eve_review_status'];
  intake_journal_id?: string;
  review_artifact_path?: string;
  receipt_present: boolean;
  receipt_generated_at?: string;
  blocked_reasons: string[];
};

export type TrackRP3IntakeObservability = {
  ok: boolean;
  read_only: true;
  execution_authorized: false;
  data_source: 'kv' | 'committed_registry' | 'fallback';
  run_id: string;
  packet_hash: string | null;
  journal_id: string | null;
  production_commit: string | null;
  intake_state: TrackRP3OperatorIntakeState;
  last_intake_at: string | null;
  intake_journal_emitted: boolean;
  structurally_accepted: boolean;
  superseded_by_run_id: string | null;
  supersedes_run_id: string | null;
  zeus: TrackRP3ReviewLaneStatus;
  eve: TrackRP3ReviewLaneStatus;
  human_review_status: PacketReviewRegistryEntry['human_review_status'] | 'awaiting_human';
  blocked_reasons: string[];
  errors: string[];
};

const CANONICAL_CURRENT_RUN = '32264177719';
const SUPERSEDED_RUN = '32264049953';

function mapRegistryStatusToIntakeState(
  entry: PacketReviewRegistryEntry | undefined,
  issued: IssuedPacketRegistryEntry | undefined,
): TrackRP3OperatorIntakeState {
  if (entry?.status === 'superseded') return 'SUPERSEDED';
  if (!issued && !entry) return 'NOT_SEEN';
  if (entry?.status === 'challenged') return 'BLOCKED';
  if (entry?.status === 'adopted_for_handoff_consideration') return 'REVIEW_IN_PROGRESS';
  if (entry?.status === 'awaiting_human') return 'REVIEW_IN_PROGRESS';
  if (entry?.status === 'intake_verified') return 'INTAKE_VERIFIED';
  if (entry?.status === 'awaiting_zeus' || entry?.status === 'awaiting_eve') {
    return 'AWAITING_INDEPENDENT_REVIEW';
  }
  if (entry?.status === 'discovered') return 'NOT_SEEN';
  if (issued) return 'AWAITING_INDEPENDENT_REVIEW';
  return 'NOT_SEEN';
}

function laneStatus(args: {
  lane: TrackRP3ReviewLane;
  entry: PacketReviewRegistryEntry | undefined;
  receipt: TrackRP3ReviewReceiptRecord | null;
  intakeState: TrackRP3OperatorIntakeState;
}): TrackRP3ReviewLaneStatus {
  const reviewStatus =
    args.lane === 'ZEUS'
      ? args.entry?.zeus_review_status ?? 'awaiting_zeus'
      : args.entry?.eve_review_status ?? 'awaiting_eve';

  const blocked_reasons: string[] = [];
  if (args.intakeState === 'SUPERSEDED') {
    blocked_reasons.push('superseded_run_not_current');
  }
  if (args.intakeState === 'NOT_SEEN') {
    blocked_reasons.push('intake_not_observed');
  }
  if (reviewStatus === 'adopt' || reviewStatus === 'challenge' || reviewStatus === 'overturn') {
    blocked_reasons.push('independent_review_recorded_separately');
  }

  return {
    lane: args.lane,
    intake_state: args.intakeState,
    review_status: reviewStatus,
    intake_journal_id:
      args.lane === 'ZEUS' ? args.entry?.zeus_intake_journal_id : args.entry?.eve_intake_journal_id,
    review_artifact_path:
      args.lane === 'ZEUS' ? args.entry?.zeus_review_artifact_path : args.entry?.eve_review_artifact_path,
    receipt_present: args.receipt != null,
    receipt_generated_at: args.receipt?.generated_at,
    blocked_reasons,
  };
}

export async function buildTrackRP3IntakeObservability(args: {
  workflowRunId?: string;
  repoRoot?: string;
}): Promise<TrackRP3IntakeObservability> {
  const runId = args.workflowRunId ?? CANONICAL_CURRENT_RUN;
  const repoRoot = args.repoRoot ?? process.cwd();
  const errors: string[] = [];
  const blocked_reasons: string[] = [];

  const issuedLoad = loadIssuedPacketRegistry(repoRoot);
  const issued = issuedLoad.ok
    ? issuedLoad.registry.entries.find((row) => row.workflow_run_id === runId)
    : undefined;
  if (!issuedLoad.ok) errors.push(...issuedLoad.errors);

  let data_source: TrackRP3IntakeObservability['data_source'] = 'fallback';
  let registryEntry: PacketReviewRegistryEntry | undefined;

  const kvRegistry = await kvGet<{ entries?: PacketReviewRegistryEntry[] }>(
    TRACK_R_P3_REVIEW_REGISTRY_KV_KEY,
  );
  if (kvRegistry && Array.isArray(kvRegistry.entries)) {
    data_source = 'kv';
    registryEntry = findPacketReviewEntry(
      { schema_version: '1', note: '', entries: kvRegistry.entries },
      runId,
    );
  } else {
    const committed = loadPacketReviewRegistry(repoRoot);
    if (committed.ok) {
      data_source = 'committed_registry';
      registryEntry = findPacketReviewEntry(committed.registry, runId);
    } else {
      errors.push(...committed.errors);
    }
  }

  const zeusReceipt = await kvGet<TrackRP3ReviewReceiptRecord>(
    trackRP3ReviewReceiptKvKey({ workflowRunId: runId, lane: 'ZEUS' }),
  );
  const eveReceipt = await kvGet<TrackRP3ReviewReceiptRecord>(
    trackRP3ReviewReceiptKvKey({ workflowRunId: runId, lane: 'EVE' }),
  );

  const intake_state = mapRegistryStatusToIntakeState(registryEntry, issued);

  if (runId === SUPERSEDED_RUN) {
    blocked_reasons.push('superseded_run_cannot_satisfy_current_gates');
  }
  if (registryEntry?.superseded_by_workflow_run_id) {
    blocked_reasons.push(`superseded_by_${registryEntry.superseded_by_workflow_run_id}`);
  }
  if (!registryEntry?.intake_journals_completed) {
    blocked_reasons.push('durable_intake_journal_not_demonstrated');
  }
  if (
    registryEntry?.human_review_status !== 'approved' &&
    registryEntry?.human_review_status !== 'pending'
  ) {
    blocked_reasons.push('human_consent_absent');
  }
  blocked_reasons.push('execution_handoff_absent');

  const packet_hash = registryEntry?.packet_hash ?? issued?.packet_hash ?? null;
  const journal_id = registryEntry?.journal_id ?? issued?.journal_id ?? null;
  const production_commit =
    registryEntry?.observed_production_commit ?? issued?.observed_production_commit ?? null;

  if (packet_hash && issued?.packet_hash && packet_hash !== issued.packet_hash) {
    errors.push('packet_hash_mismatch_between_registry_and_issued');
    blocked_reasons.push('packet_hash_binding_failed');
  }

  return {
    ok: errors.length === 0,
    read_only: true,
    execution_authorized: false,
    data_source,
    run_id: runId,
    packet_hash,
    journal_id,
    production_commit,
    intake_state,
    last_intake_at: registryEntry?.last_intake_at ?? registryEntry?.intake_verified_at ?? null,
    intake_journal_emitted: Boolean(registryEntry?.intake_journals_completed),
    structurally_accepted: intake_state === 'INTAKE_VERIFIED' || intake_state === 'AWAITING_INDEPENDENT_REVIEW',
    superseded_by_run_id: registryEntry?.superseded_by_workflow_run_id ?? null,
    supersedes_run_id: registryEntry?.supersedes_workflow_run_id ?? null,
    zeus: laneStatus({
      lane: 'ZEUS',
      entry: registryEntry,
      receipt: zeusReceipt,
      intakeState: intake_state,
    }),
    eve: laneStatus({
      lane: 'EVE',
      entry: registryEntry,
      receipt: eveReceipt,
      intakeState: intake_state,
    }),
    human_review_status: registryEntry?.human_review_status ?? 'awaiting_human',
    blocked_reasons,
    errors,
  };
}

export const TRACK_R_P3_CANONICAL_RUN = CANONICAL_CURRENT_RUN;
export const TRACK_R_P3_SUPERSEDED_RUN = SUPERSEDED_RUN;
