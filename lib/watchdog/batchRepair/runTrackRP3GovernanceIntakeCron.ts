import { appendAgentJournalEntry } from '@/lib/agents/journal';
import type { AgentJournalEntry } from '@/lib/terminal/types';
import {
  findPacketReviewEntry,
  upsertPacketReviewEntry,
  type PacketReviewRegistryEntry,
} from '@/lib/watchdog/batchRepair/p3PacketReviewRegistry';
import { loadIssuedPacketRegistry } from '@/lib/watchdog/batchRepair/p3IssuedPacketRegistry';
import {
  renderTrackRP3MachineVerificationReceipt,
  trackRP3ReviewArtifactPath,
  TRACK_R_P3_GOVERNANCE_SCOPE,
  type TrackRP3ReviewLane,
} from '@/lib/watchdog/batchRepair/trackRP3ReviewArtifacts';
import {
  buildTrackRP3EvidenceIdentity,
  evidenceIdentityDigest,
  runTrackRP3GovernanceIntake,
  type TrackRP3IntakeResult,
  type TrackRP3ReviewContext,
} from '@/lib/watchdog/batchRepair/trackRP3GovernanceIntake';
import {
  InMemoryTrackRP3ReviewStateStore,
  KvTrackRP3ReviewStateStore,
  type TrackRP3ReviewStateStore,
} from '@/lib/watchdog/batchRepair/trackRP3ReviewStateStore';

export type TrackRP3GovernanceIntakeCronResult =
  | {
      ok: true;
      status: 'intake_verified' | 'seen';
      intake: TrackRP3IntakeResult & { ok: true };
      zeus_identity_digest: string;
      eve_identity_digest: string;
      zeus_review_artifact_path: string;
      eve_review_artifact_path: string;
      execution_authorized: false;
      idempotent: boolean;
    }
  | {
      ok: false;
      status: 'blocked';
      errors: string[];
      execution_authorized: false;
    };

const TERMINAL_ZEUS_REVIEW = new Set(['adopt', 'challenge', 'overturn']);
const TERMINAL_EVE_REVIEW = new Set(['adopt', 'challenge', 'overturn']);
const TERMINAL_HUMAN_REVIEW = new Set(['approved', 'rejected', 'pending']);

function mergeReviewRegistryEntry(args: {
  context: TrackRP3ReviewContext;
  now: string;
  historicalSuperseded?: { workflow_run_id: string };
  existing?: PacketReviewRegistryEntry;
  zeusJournalId?: string;
  eveJournalId?: string;
  intakeJournalsCompleted: boolean;
}): PacketReviewRegistryEntry {
  const existing = args.existing;
  const zeusPath =
    existing?.zeus_review_artifact_path ??
    trackRP3ReviewArtifactPath({ workflowRunId: args.context.workflow_run_id, lane: 'ZEUS' });
  const evePath =
    existing?.eve_review_artifact_path ??
    trackRP3ReviewArtifactPath({ workflowRunId: args.context.workflow_run_id, lane: 'EVE' });

  const preserveZeusStatus =
    existing?.packet_hash === args.context.packet_hash &&
    existing.zeus_review_status &&
    TERMINAL_ZEUS_REVIEW.has(existing.zeus_review_status);
  const preserveEveStatus =
    existing?.packet_hash === args.context.packet_hash &&
    existing.eve_review_status &&
    TERMINAL_EVE_REVIEW.has(existing.eve_review_status);
  const preserveHumanStatus =
    existing?.packet_hash === args.context.packet_hash &&
    existing.human_review_status &&
    TERMINAL_HUMAN_REVIEW.has(existing.human_review_status);

  return {
    workflow_run_id: args.context.workflow_run_id,
    packet_hash: args.context.packet_hash,
    journal_id: args.context.journal_id,
    journal_hash: args.context.journal_hash,
    observed_production_commit: args.context.observed_production_commit,
    capture_id: args.context.capture_id,
    status:
      existing?.packet_hash === args.context.packet_hash && existing.status === 'intake_verified'
        ? existing.status
        : 'intake_verified',
    execution_authorized: false,
    discovered_at: existing?.discovered_at ?? args.now,
    intake_verified_at: existing?.intake_verified_at ?? args.now,
    supersedes_workflow_run_id: args.historicalSuperseded?.workflow_run_id,
    // Intake completion (a machine-verification receipt) is never promoted into the
    // zeus_review_status / eve_review_status field, because that field's terminal
    // values (adopt/challenge/overturn) are read elsewhere as an independent verdict.
    // An intake receipt is not a verdict — see JOB-17. Only a genuine, separately
    // recorded independent review (validateTrackRIndependentReviewRecord) may move
    // these off their awaiting_* default.
    zeus_review_status: preserveZeusStatus ? existing!.zeus_review_status : 'awaiting_zeus',
    eve_review_status: preserveEveStatus ? existing!.eve_review_status : 'awaiting_eve',
    human_review_status: preserveHumanStatus ? existing!.human_review_status : 'awaiting_human',
    zeus_review_artifact_path: zeusPath,
    eve_review_artifact_path: evePath,
    zeus_intake_journal_id: args.zeusJournalId ?? existing?.zeus_intake_journal_id,
    eve_intake_journal_id: args.eveJournalId ?? existing?.eve_intake_journal_id,
    intake_journals_completed: args.intakeJournalsCompleted,
    last_intake_at: args.now,
  };
}

function mergeSupersededReviewEntry(args: {
  row: {
    workflow_run_id: string;
    packet_hash: string;
    superseded_by_workflow_run_id?: string;
  };
  now: string;
  issuedEntry?: {
    journal_id: string;
    journal_hash: string;
    observed_production_commit: string;
  };
  existing?: PacketReviewRegistryEntry;
  captureId: string;
}): PacketReviewRegistryEntry {
  const existing = args.existing;
  return {
    workflow_run_id: args.row.workflow_run_id,
    packet_hash: args.row.packet_hash,
    journal_id: args.issuedEntry?.journal_id ?? existing?.journal_id ?? 'unknown',
    journal_hash: args.issuedEntry?.journal_hash ?? existing?.journal_hash ?? 'unknown',
    observed_production_commit:
      args.issuedEntry?.observed_production_commit ?? existing?.observed_production_commit ?? 'unknown',
    capture_id: existing?.capture_id ?? args.captureId,
    status: 'superseded',
    execution_authorized: false,
    discovered_at: existing?.discovered_at ?? args.now,
    superseded_by_workflow_run_id: args.row.superseded_by_workflow_run_id,
    zeus_review_status: existing?.zeus_review_status ?? 'awaiting_zeus',
    eve_review_status: existing?.eve_review_status ?? 'awaiting_eve',
    human_review_status: existing?.human_review_status ?? 'awaiting_human',
    intake_journals_completed: existing?.intake_journals_completed ?? false,
    last_intake_at: args.now,
  };
}

async function appendTrackRP3GovernanceJournal(args: {
  lane: TrackRP3ReviewLane;
  context: TrackRP3ReviewContext;
  cycle: string;
}): Promise<AgentJournalEntry> {
  const journalId = `track-r-p3-${args.context.workflow_run_id}-${args.lane.toLowerCase()}-intake`;
  const tags = [
    `workflow_run_id:${args.context.workflow_run_id}`,
    `packet_hash:${args.context.packet_hash}`,
    `journal_id:${args.context.journal_id}`,
    `observed_production_commit:${args.context.observed_production_commit}`,
    `review_lane:${args.lane}`,
    'review_status:INTAKE_VERIFIED',
    'execution_authorized:false',
    'production_mutation_performed:false',
  ];

  const observation =
    args.lane === 'ZEUS'
      ? `Track R P3 packet intake verified for run ${args.context.workflow_run_id}. Machine verification receipt emitted; independent ZEUS adversarial review still required.`
      : `Track R P3 packet intake verified for run ${args.context.workflow_run_id}. Machine verification receipt emitted; independent EVE constitutional review still required.`;

  return appendAgentJournalEntry({
    id: journalId,
    agent: args.lane,
    cycle: args.cycle,
    scope: TRACK_R_P3_GOVERNANCE_SCOPE,
    observation,
    inference:
      'Deterministic evidence hashes, registry binding, and authority posture checks passed. This intake journal is not ADOPT and does not authorize execution.',
    recommendation:
      'Await independent model review in the dedicated Track R P3 lane before any handoff consideration or production mutation.',
    confidence: 0.5,
    derivedFrom: tags,
    relatedAgents: args.lane === 'ZEUS' ? ['EVE'] : ['ZEUS'],
    status: 'committed',
    category: 'governance-review',
    severity: 'nominal',
  });
}

function resolveReviewStateStore(args?: {
  repoRoot?: string;
  reviewStateStore?: TrackRP3ReviewStateStore;
}): TrackRP3ReviewStateStore {
  if (args?.reviewStateStore) return args.reviewStateStore;
  return new KvTrackRP3ReviewStateStore();
}

export async function runTrackRP3GovernanceIntakeCron(args?: {
  repoRoot?: string;
  cycle?: string;
  skipJournalWrites?: boolean;
  reviewStateStore?: TrackRP3ReviewStateStore;
}): Promise<TrackRP3GovernanceIntakeCronResult> {
  const repoRoot = args?.repoRoot ?? process.cwd();
  const now = new Date().toISOString();
  const store = resolveReviewStateStore(args);
  const intake = runTrackRP3GovernanceIntake({ repoRoot });

  if (!intake.ok) {
    return {
      ok: false,
      status: 'blocked',
      errors: intake.errors,
      execution_authorized: false,
    };
  }

  const identity = buildTrackRP3EvidenceIdentity(intake.candidate);
  const zeusDigest = evidenceIdentityDigest(identity);
  const eveDigest = evidenceIdentityDigest(identity);
  if (zeusDigest !== eveDigest) {
    return {
      ok: false,
      status: 'blocked',
      errors: ['ZEUS and EVE evidence identity digests differ — intake blocked'],
      execution_authorized: false,
    };
  }

  const reviewRegistryResult = await store.loadRegistry();
  if (!reviewRegistryResult.ok) {
    return {
      ok: false,
      status: 'blocked',
      errors: reviewRegistryResult.errors,
      execution_authorized: false,
    };
  }

  let registry = reviewRegistryResult.registry;
  const existingCandidate = findPacketReviewEntry(registry, intake.candidate.workflow_run_id);
  const idempotent =
    existingCandidate?.packet_hash === intake.candidate.packet_hash &&
    existingCandidate.intake_journals_completed === true;

  const superseded = intake.historicalPackets.filter((row) => row.status === 'superseded');
  const issuedLookup = loadIssuedPacketRegistry(repoRoot);
  for (const row of superseded) {
    const issuedEntry = issuedLookup.ok
      ? issuedLookup.registry.entries.find((entry) => entry.workflow_run_id === row.workflow_run_id)
      : undefined;
    const existing = findPacketReviewEntry(registry, row.workflow_run_id);
    if (existing?.status === 'superseded' && existing.superseded_by_workflow_run_id === row.superseded_by_workflow_run_id) {
      continue;
    }
    registry = upsertPacketReviewEntry({
      registry,
      entry: mergeSupersededReviewEntry({
        row,
        now,
        issuedEntry,
        existing,
        captureId: intake.candidate.capture_id,
      }),
    });
  }

  let zeusJournalId = existingCandidate?.zeus_intake_journal_id;
  let eveJournalId = existingCandidate?.eve_intake_journal_id;
  let intakeJournalsCompleted = existingCandidate?.intake_journals_completed === true;

  const zeusArtifactPath =
    existingCandidate?.zeus_review_artifact_path ??
    trackRP3ReviewArtifactPath({ workflowRunId: intake.candidate.workflow_run_id, lane: 'ZEUS' });
  const eveArtifactPath =
    existingCandidate?.eve_review_artifact_path ??
    trackRP3ReviewArtifactPath({ workflowRunId: intake.candidate.workflow_run_id, lane: 'EVE' });

  if (!idempotent) {
    await store.saveReceipt({
      workflowRunId: intake.candidate.workflow_run_id,
      lane: 'ZEUS',
      generatedAt: now,
      content: renderTrackRP3MachineVerificationReceipt({
        lane: 'ZEUS',
        context: intake.candidate,
        generatedAt: now,
        intakeStatus: 'AWAITING_INDEPENDENT_REVIEW',
      }),
    });
    await store.saveReceipt({
      workflowRunId: intake.candidate.workflow_run_id,
      lane: 'EVE',
      generatedAt: now,
      content: renderTrackRP3MachineVerificationReceipt({
        lane: 'EVE',
        context: intake.candidate,
        generatedAt: now,
        intakeStatus: 'AWAITING_INDEPENDENT_REVIEW',
      }),
    });

    if (!args?.skipJournalWrites) {
      const cycle = args?.cycle?.trim() || 'C-408';
      const zeusEntry = await appendTrackRP3GovernanceJournal({
        lane: 'ZEUS',
        context: intake.candidate,
        cycle,
      });
      const eveEntry = await appendTrackRP3GovernanceJournal({
        lane: 'EVE',
        context: intake.candidate,
        cycle,
      });
      zeusJournalId = zeusEntry.id;
      eveJournalId = eveEntry.id;
      intakeJournalsCompleted = true;
    }
  }

  const candidateEntry = mergeReviewRegistryEntry({
    context: intake.candidate,
    now,
    historicalSuperseded: superseded[0],
    existing: existingCandidate,
    zeusJournalId,
    eveJournalId,
    intakeJournalsCompleted,
  });
  registry = upsertPacketReviewEntry({ registry, entry: candidateEntry });
  try {
    await store.saveRegistry(registry);
  } catch (error) {
    return {
      ok: false,
      status: 'blocked',
      errors: [error instanceof Error ? error.message : String(error)],
      execution_authorized: false,
    };
  }

  return {
    ok: true,
    status: idempotent ? 'seen' : 'intake_verified',
    intake,
    zeus_identity_digest: zeusDigest,
    eve_identity_digest: eveDigest,
    zeus_review_artifact_path: zeusArtifactPath,
    eve_review_artifact_path: eveArtifactPath,
    execution_authorized: false,
    idempotent,
  };
}

export { InMemoryTrackRP3ReviewStateStore };
