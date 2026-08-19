import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { appendAgentJournalEntry } from '@/lib/agents/journal';
import type { AgentJournalEntry } from '@/lib/terminal/types';
import {
  findPacketReviewEntry,
  loadPacketReviewRegistry,
  upsertPacketReviewEntry,
  writePacketReviewRegistry,
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

function buildReviewRegistryEntry(args: {
  context: TrackRP3ReviewContext;
  now: string;
  historicalSuperseded?: { workflow_run_id: string };
  existing?: PacketReviewRegistryEntry;
}): PacketReviewRegistryEntry {
  const zeusPath = trackRP3ReviewArtifactPath({
    workflowRunId: args.context.workflow_run_id,
    lane: 'ZEUS',
  });
  const evePath = trackRP3ReviewArtifactPath({
    workflowRunId: args.context.workflow_run_id,
    lane: 'EVE',
  });

  const existing = args.existing;

  return {
    workflow_run_id: args.context.workflow_run_id,
    packet_hash: args.context.packet_hash,
    journal_id: args.context.journal_id,
    journal_hash: args.context.journal_hash,
    observed_production_commit: args.context.observed_production_commit,
    capture_id: args.context.capture_id,
    status: 'intake_verified',
    execution_authorized: false,
    discovered_at: existing?.discovered_at ?? args.now,
    intake_verified_at: existing?.intake_verified_at ?? args.now,
    supersedes_workflow_run_id: args.historicalSuperseded?.workflow_run_id,
    zeus_review_status: 'intake_verified',
    eve_review_status: 'intake_verified',
    human_review_status: 'awaiting_human',
    zeus_review_artifact_path: zeusPath,
    eve_review_artifact_path: evePath,
    last_intake_at: args.now,
  };
}

function writeReviewArtifact(args: {
  repoRoot: string;
  lane: TrackRP3ReviewLane;
  context: TrackRP3ReviewContext;
  generatedAt: string;
}): string {
  const relativePath = trackRP3ReviewArtifactPath({
    workflowRunId: args.context.workflow_run_id,
    lane: args.lane,
  });
  const absolutePath = join(args.repoRoot, relativePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(
    absolutePath,
    `${renderTrackRP3MachineVerificationReceipt({
      lane: args.lane,
      context: args.context,
      generatedAt: args.generatedAt,
      intakeStatus: 'AWAITING_INDEPENDENT_REVIEW',
    })}\n`,
    'utf8',
  );
  return relativePath;
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

export async function runTrackRP3GovernanceIntakeCron(args?: {
  repoRoot?: string;
  cycle?: string;
  skipJournalWrites?: boolean;
}): Promise<TrackRP3GovernanceIntakeCronResult> {
  const repoRoot = args?.repoRoot ?? process.cwd();
  const now = new Date().toISOString();
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

  const reviewRegistryResult = loadPacketReviewRegistry(repoRoot);
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
    existingCandidate.status === 'intake_verified';

  const superseded = intake.historicalPackets.filter((row) => row.status === 'superseded');
  const issuedLookup = loadIssuedPacketRegistry(repoRoot);
  for (const row of superseded) {
    const issuedEntry = issuedLookup.ok
      ? issuedLookup.registry.entries.find((entry) => entry.workflow_run_id === row.workflow_run_id)
      : undefined;
    const existing = findPacketReviewEntry(registry, row.workflow_run_id);
    registry = upsertPacketReviewEntry({
      registry,
      entry: {
        workflow_run_id: row.workflow_run_id,
        packet_hash: row.packet_hash,
        journal_id: issuedEntry?.journal_id ?? existing?.journal_id ?? 'unknown',
        journal_hash: issuedEntry?.journal_hash ?? existing?.journal_hash ?? 'unknown',
        observed_production_commit:
          issuedEntry?.observed_production_commit ?? existing?.observed_production_commit ?? 'unknown',
        capture_id: existing?.capture_id ?? intake.candidate.capture_id,
        status: 'superseded',
        execution_authorized: false,
        discovered_at: existing?.discovered_at ?? now,
        superseded_by_workflow_run_id: row.superseded_by_workflow_run_id,
        zeus_review_status: existing?.zeus_review_status ?? 'awaiting_zeus',
        eve_review_status: existing?.eve_review_status ?? 'awaiting_eve',
        human_review_status: 'awaiting_human',
        last_intake_at: now,
      },
    });
  }

  const candidateEntry = buildReviewRegistryEntry({
    context: intake.candidate,
    now,
    historicalSuperseded: superseded[0],
    existing: existingCandidate,
  });
  registry = upsertPacketReviewEntry({ registry, entry: candidateEntry });
  writePacketReviewRegistry({ registry, repoRoot });

  const zeusArtifactPath = idempotent
    ? (existingCandidate?.zeus_review_artifact_path ??
      trackRP3ReviewArtifactPath({ workflowRunId: intake.candidate.workflow_run_id, lane: 'ZEUS' }))
    : writeReviewArtifact({ repoRoot, lane: 'ZEUS', context: intake.candidate, generatedAt: now });

  const eveArtifactPath = idempotent
    ? (existingCandidate?.eve_review_artifact_path ??
      trackRP3ReviewArtifactPath({ workflowRunId: intake.candidate.workflow_run_id, lane: 'EVE' }))
    : writeReviewArtifact({ repoRoot, lane: 'EVE', context: intake.candidate, generatedAt: now });

  if (!args?.skipJournalWrites && !idempotent) {
    const cycle = args?.cycle?.trim() || 'C-408';
    await appendTrackRP3GovernanceJournal({ lane: 'ZEUS', context: intake.candidate, cycle });
    await appendTrackRP3GovernanceJournal({ lane: 'EVE', context: intake.candidate, cycle });
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
