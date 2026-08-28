/**
 * C-409 — read-only Track R P3 intake observability.
 *
 * Never issues ADOPT, never authorizes execution, never synthesizes verdicts.
 */

import { kvGet, kvGetOrThrow } from '@/lib/kv/store';
import {
  findPacketReviewEntry,
  loadPacketReviewRegistry,
  type PacketReviewRegistry,
  type PacketReviewRegistryEntry,
} from '@/lib/watchdog/batchRepair/p3PacketReviewRegistry';
import {
  loadIssuedPacketRegistryResolved,
  type IssuedPacketRegistrySource,
} from '@/lib/watchdog/batchRepair/p3IssuedPacketRegistryStore';
import {
  loadIssuedPacketRegistry,
  resolveLatestIssuedPacketRunId,
  type IssuedPacketRegistry,
  type IssuedPacketRegistryEntry,
} from '@/lib/watchdog/batchRepair/p3IssuedPacketRegistry';
import {
  loadTrackRP3ReviewRegistryFromKvRow,
  TRACK_R_P3_REVIEW_REGISTRY_KV_KEY,
  trackRP3ReviewReceiptKvKey,
  type TrackRP3ReviewReceiptRecord,
} from '@/lib/watchdog/batchRepair/trackRP3ReviewStateStore';
import type { TrackRP3ReviewLane } from '@/lib/watchdog/batchRepair/trackRP3ReviewArtifacts';
import {
  resolveTrackRP3SelectedReviewPair,
  type TrackRP3SelectedReview,
  type TrackRP3SelectedReviewResult,
} from '@/lib/watchdog/batchRepair/trackRP3SelectedReview';

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

export type TrackRP3IntakeDataSource =
  | 'kv'
  | 'committed_registry'
  | 'fallback'
  | 'kv_unavailable';

/**
 * Durable, committed-tree-only selected review for one lane. Distinct from `zeus`/`eve`
 * above (which reflect the KV/committed *registry* intake state): this reflects only
 * whether a genuine, identity-bound, schema-valid verdict artifact exists in the
 * checked-out repository — never an intake receipt, never KV. See
 * trackRP3SelectedReview.ts. `status: 'PENDING'` is the explicit, honest default for
 * "no durable verdict yet" — it is never inferred from intake completion.
 */
export type TrackRP3ReviewSelectedStatus = {
  status: 'PENDING' | 'ADOPT' | 'CHALLENGE' | 'OVERTURN';
  artifact_present: boolean;
  artifact_path: string;
  artifact_hash: string | null;
  source: 'committed' | 'absent';
  independence_status: 'verified' | 'unverified';
  blocked_reasons: string[];
};

export type TrackRP3IntakeObservability = {
  ok: boolean;
  read_only: true;
  execution_authorized: false;
  issued_registry_source: IssuedPacketRegistrySource;
  data_source: TrackRP3IntakeDataSource;
  run_id: string | null;
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
  reviews: { zeus: TrackRP3ReviewSelectedStatus; eve: TrackRP3ReviewSelectedStatus };
  human_review_status: PacketReviewRegistryEntry['human_review_status'] | 'awaiting_human';
  blocked_reasons: string[];
  errors: string[];
};

function isSupersededByNewerIssuance(args: {
  runId: string;
  issuedRegistry: IssuedPacketRegistry;
}): { superseded: boolean; supersededByRunId: string | null } {
  const target = args.issuedRegistry.entries.find((row) => row.workflow_run_id === args.runId);
  if (!target) {
    return { superseded: false, supersededByRunId: null };
  }
  const newer = args.issuedRegistry.entries
    .filter((row) => row.workflow_run_id !== args.runId)
    .filter((row) => Date.parse(row.issued_at) > Date.parse(target.issued_at))
    .sort((a, b) => Date.parse(b.issued_at) - Date.parse(a.issued_at))[0];
  if (newer) {
    return { superseded: true, supersededByRunId: newer.workflow_run_id };
  }
  return { superseded: false, supersededByRunId: null };
}

function resolveSupersession(args: {
  runId: string;
  issuedRegistry: IssuedPacketRegistry | null;
}): { superseded: boolean; supersededByRunId: string | null } {
  if (!args.issuedRegistry) {
    return { superseded: false, supersededByRunId: null };
  }
  return isSupersededByNewerIssuance({ runId: args.runId, issuedRegistry: args.issuedRegistry });
}

function mapRegistryStatusToIntakeState(args: {
  entry: PacketReviewRegistryEntry | undefined;
  issued: IssuedPacketRegistryEntry | undefined;
  superseded: boolean;
  registryUnavailable: boolean;
}): TrackRP3OperatorIntakeState {
  if (args.registryUnavailable) return 'BLOCKED';
  if (args.superseded || args.entry?.status === 'superseded') return 'SUPERSEDED';
  if (!args.entry) {
    if (args.issued) return 'AWAITING_INDEPENDENT_REVIEW';
    return 'NOT_SEEN';
  }
  if (args.entry.status === 'challenged') return 'BLOCKED';
  if (args.entry.status === 'adopted_for_handoff_consideration') return 'REVIEW_IN_PROGRESS';
  if (args.entry.status === 'awaiting_human') return 'REVIEW_IN_PROGRESS';
  if (args.entry.status === 'intake_verified') return 'INTAKE_VERIFIED';
  if (args.entry.status === 'awaiting_zeus' || args.entry.status === 'awaiting_eve') {
    return 'AWAITING_INDEPENDENT_REVIEW';
  }
  if (args.entry.status === 'discovered') return 'NOT_SEEN';
  return 'NOT_SEEN';
}

function selectedReviewStatus(result: TrackRP3SelectedReviewResult): TrackRP3ReviewSelectedStatus {
  if (!result.ok) {
    return {
      status: 'PENDING',
      artifact_present: false,
      artifact_path: '',
      artifact_hash: null,
      source: 'absent',
      independence_status: 'unverified',
      blocked_reasons: [result.blockedReason.toLowerCase(), ...result.errors],
    };
  }
  const review: TrackRP3SelectedReview = result.review;
  return {
    status: review.verdict,
    artifact_present: review.artifact_present,
    artifact_path: review.artifact_path,
    artifact_hash: review.artifact_hash,
    source: review.source,
    independence_status: review.independence_status,
    blocked_reasons: review.blocked_reasons,
  };
}

function selectedReviewsPairStatus(args: {
  repoRoot: string;
  runId?: string;
}): { zeus: TrackRP3ReviewSelectedStatus; eve: TrackRP3ReviewSelectedStatus } {
  // Always resolve both lanes together — resolveTrackRP3SelectedReviewPair is the only
  // path that applies the cross-lane independence collision check (JOB-17 P1 fix).
  const pair = resolveTrackRP3SelectedReviewPair({ repoRoot: args.repoRoot, expectedRunId: args.runId });
  return { zeus: selectedReviewStatus(pair.zeus), eve: selectedReviewStatus(pair.eve) };
}

function emptyLaneStatus(lane: TrackRP3ReviewLane): TrackRP3ReviewLaneStatus {
  return {
    lane,
    intake_state: 'BLOCKED',
    review_status: lane === 'ZEUS' ? 'awaiting_zeus' : 'awaiting_eve',
    receipt_present: false,
    blocked_reasons: ['issued_registry_unavailable'],
  };
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
  if (args.intakeState === 'BLOCKED') {
    blocked_reasons.push('review_blocked');
  }
  if (args.intakeState === 'AWAITING_INDEPENDENT_REVIEW') {
    blocked_reasons.push('governance_intake_pending');
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

async function loadReviewRegistry(args: {
  repoRoot: string;
}): Promise<{
  data_source: TrackRP3IntakeDataSource;
  registry: PacketReviewRegistry | null;
  errors: string[];
}> {
  try {
    const kvRow = await kvGetOrThrow<PacketReviewRegistry>(TRACK_R_P3_REVIEW_REGISTRY_KV_KEY);
    if (kvRow != null) {
      const loaded = loadTrackRP3ReviewRegistryFromKvRow(kvRow);
      if (!loaded.ok) {
        return { data_source: 'kv_unavailable', registry: null, errors: loaded.errors };
      }
      return { data_source: 'kv', registry: loaded.registry, errors: [] };
    }
  } catch (error) {
    const message = `Track R P3 review registry KV read failed: ${
      error instanceof Error ? error.message : String(error)
    }`;
    const committed = loadPacketReviewRegistry(args.repoRoot);
    if (committed.ok) {
      return {
        data_source: 'kv_unavailable',
        registry: committed.registry,
        errors: [message],
      };
    }
    return { data_source: 'kv_unavailable', registry: null, errors: [message, ...committed.errors] };
  }

  const committed = loadPacketReviewRegistry(args.repoRoot);
  if (committed.ok) {
    return { data_source: 'committed_registry', registry: committed.registry, errors: [] };
  }
  return { data_source: 'fallback', registry: null, errors: committed.errors };
}

export async function buildTrackRP3IntakeObservability(args: {
  workflowRunId?: string;
  repoRoot?: string;
}): Promise<TrackRP3IntakeObservability> {
  const repoRoot = args.repoRoot ?? process.cwd();
  const errors: string[] = [];
  const blocked_reasons: string[] = [];

  const issuedResolved = await loadIssuedPacketRegistryResolved({ repoRoot });
  const issuedRegistry = issuedResolved.result.ok ? issuedResolved.result.registry : null;
  if (!issuedResolved.result.ok) {
    errors.push(...issuedResolved.result.errors);
    blocked_reasons.push('issued_registry_unavailable');
  }

  const latestRunId = issuedRegistry ? resolveLatestIssuedPacketRunId(issuedRegistry) : null;
  const runId = args.workflowRunId?.trim() || latestRunId;
  if (!runId) {
    errors.push('no issued packet run_id available');
    blocked_reasons.push('issued_registry_unavailable');
    return {
      ok: false,
      read_only: true,
      execution_authorized: false,
      issued_registry_source: issuedResolved.source,
      data_source: 'fallback',
      run_id: null,
      packet_hash: null,
      journal_id: null,
      production_commit: null,
      intake_state: 'BLOCKED',
      last_intake_at: null,
      intake_journal_emitted: false,
      structurally_accepted: false,
      superseded_by_run_id: null,
      supersedes_run_id: null,
      zeus: emptyLaneStatus('ZEUS'),
      eve: emptyLaneStatus('EVE'),
      reviews: selectedReviewsPairStatus({ repoRoot }),
      human_review_status: 'awaiting_human',
      blocked_reasons,
      errors,
    };
  }

  const issued = issuedRegistry?.entries.find((row) => row.workflow_run_id === runId);
  if (!issued && issuedRegistry) {
    errors.push(`issued registry has no entry for workflow_run_id ${runId}`);
    blocked_reasons.push('unknown_workflow_run_id');
  }

  const supersession = resolveSupersession({ runId, issuedRegistry });

  const registryLoad = await loadReviewRegistry({ repoRoot });
  errors.push(...registryLoad.errors);

  const data_source = registryLoad.data_source;
  const registryEntry = registryLoad.registry
    ? findPacketReviewEntry(registryLoad.registry, runId)
    : undefined;

  const zeusReceipt = await kvGet<TrackRP3ReviewReceiptRecord>(
    trackRP3ReviewReceiptKvKey({ workflowRunId: runId, lane: 'ZEUS' }),
  );
  const eveReceipt = await kvGet<TrackRP3ReviewReceiptRecord>(
    trackRP3ReviewReceiptKvKey({ workflowRunId: runId, lane: 'EVE' }),
  );

  const registryUnavailable = issuedResolved.source === 'unavailable';
  const intake_state = mapRegistryStatusToIntakeState({
    entry: registryEntry,
    issued,
    superseded: supersession.superseded,
    registryUnavailable,
  });

  if (supersession.superseded) {
    blocked_reasons.push('superseded_run_cannot_satisfy_current_gates');
    if (supersession.supersededByRunId) {
      blocked_reasons.push(`superseded_by_${supersession.supersededByRunId}`);
    }
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
  if (data_source === 'kv_unavailable') {
    blocked_reasons.push('runtime_registry_kv_unavailable');
  }

  const packet_hash = registryEntry?.packet_hash ?? issued?.packet_hash ?? null;
  const journal_id = registryEntry?.journal_id ?? issued?.journal_id ?? null;
  const production_commit =
    registryEntry?.observed_production_commit ?? issued?.observed_production_commit ?? null;

  if (packet_hash && issued?.packet_hash && packet_hash !== issued.packet_hash) {
    errors.push('packet_hash_mismatch_between_registry_and_issued');
    blocked_reasons.push('packet_hash_binding_failed');
  }

  const structurally_accepted = intake_state === 'INTAKE_VERIFIED';
  const observabilityOk = errors.length === 0 && intake_state !== 'BLOCKED';

  return {
    ok: observabilityOk,
    read_only: true,
    execution_authorized: false,
    issued_registry_source: issuedResolved.source,
    data_source,
    run_id: runId,
    packet_hash,
    journal_id,
    production_commit,
    intake_state,
    last_intake_at: registryEntry?.last_intake_at ?? registryEntry?.intake_verified_at ?? null,
    intake_journal_emitted: Boolean(registryEntry?.intake_journals_completed),
    structurally_accepted,
    superseded_by_run_id:
      registryEntry?.superseded_by_workflow_run_id ??
      (supersession.superseded ? supersession.supersededByRunId : null),
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
    reviews: selectedReviewsPairStatus({ repoRoot, runId }),
    human_review_status: registryEntry?.human_review_status ?? 'awaiting_human',
    blocked_reasons,
    errors,
  };
}

/** Latest issued packet run id from committed registry (tests / local tooling). */
export function getLatestIssuedPacketRunIdFromRepo(repoRoot?: string): string | null {
  const loaded = loadIssuedPacketRegistry(repoRoot);
  if (!loaded.ok) return null;
  return resolveLatestIssuedPacketRunId(loaded.registry);
}
