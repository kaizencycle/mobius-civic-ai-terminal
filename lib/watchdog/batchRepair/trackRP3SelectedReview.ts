/**
 * JOB-17 (C-417) — Track R P3 durable selected-source review resolver.
 *
 * Resolves, per lane (ZEUS/EVE), whether a genuine independent verdict exists for the
 * CURRENT (non-superseded) issued packet — reading ONLY the committed repository tree,
 * never KV or any network source. That is deliberate: KV is not durable (it can be
 * wiped, is not git-tracked, and is not reviewable in a PR diff), so a resolver that
 * could read it would let a runtime-only claim masquerade as committed evidence. This
 * module cannot do that by construction — there is no KV/network import here at all.
 *
 * An intake receipt (machine-verification, "AWAITING_INDEPENDENT_REVIEW") is never
 * sufficient to produce a verdict. Only a schema-valid, identity-bound artifact at
 * trackRP3ReviewVerdictArtifactPath — validated against the exact current packet
 * binding, a live agent Badge, and cross-lane independence — can move a lane's verdict
 * off PENDING. Missing, stale, mismatched, or malformed artifacts fail closed to PENDING
 * (or to an explicit PACKET_BINDING_CHANGED error), never to an inferred verdict.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getAgentBadge } from '@/lib/agents/badge/stewardshipRegistry';
import { validateAgentBadge, validateBadgePermitsParticipation } from '@/lib/agents/badge/validate';
import { sha256Hex } from '@/lib/watchdog/batchRepair/stableHash';
import {
  runTrackRP3GovernanceIntake,
  type TrackRP3ReviewContext,
} from '@/lib/watchdog/batchRepair/trackRP3GovernanceIntake';
import {
  trackRP3ReviewVerdictArtifactPath,
  validateTrackRIndependentReviewRecord,
  type TrackRIndependentReviewRecord,
  type TrackRIndependentReviewVerdict,
  type TrackRP3ReviewLane,
} from '@/lib/watchdog/batchRepair/trackRP3ReviewArtifacts';

export type TrackRP3ReviewSourcedVerdict = 'PENDING' | TrackRIndependentReviewVerdict;

export type TrackRP3SelectedReview = {
  agent: TrackRP3ReviewLane;
  packet_run_id: string;
  packet_hash: string;
  verdict: TrackRP3ReviewSourcedVerdict;
  artifact_path: string;
  artifact_hash: string | null;
  artifact_present: boolean;
  /** Only 'committed' (present, validated, in the checked-out tree) or 'absent'. This
   *  resolver never reads KV, so a 'durable_runtime' source can never be claimed here. */
  source: 'committed' | 'absent';
  issued_at: string | null;
  model_provenance: string | null;
  evidence_provenance: string[];
  independence_status: 'verified' | 'unverified';
  human_approval: false;
  execution_authorized: false;
  blocked_reasons: string[];
};

export type TrackRP3SelectedReviewResult =
  | { ok: true; review: TrackRP3SelectedReview }
  | { ok: false; blockedReason: 'INTAKE_UNAVAILABLE' | 'PACKET_BINDING_CHANGED'; errors: string[] };

function pendingReview(args: {
  lane: TrackRP3ReviewLane;
  context: TrackRP3ReviewContext;
  artifactPath: string;
  blocked_reasons: string[];
  artifactHash?: string | null;
}): TrackRP3SelectedReview {
  return {
    agent: args.lane,
    packet_run_id: args.context.workflow_run_id,
    packet_hash: args.context.packet_hash,
    verdict: 'PENDING',
    artifact_path: args.artifactPath,
    artifact_hash: args.artifactHash ?? null,
    artifact_present: args.artifactHash != null,
    source: args.artifactHash != null ? 'committed' : 'absent',
    issued_at: null,
    model_provenance: null,
    evidence_provenance: [],
    independence_status: 'unverified',
    human_approval: false,
    execution_authorized: false,
    blocked_reasons: args.blocked_reasons,
  };
}

/** sha256 of the raw artifact bytes, for artifact_hash / stale-artifact detection. */
function hashArtifactFile(path: string): string {
  return sha256Hex(readFileSync(path, 'utf8'));
}

function readVerdictArtifact(
  path: string,
): { ok: true; raw: string; record: Partial<TrackRIndependentReviewRecord> } | { ok: false; error: string } {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (error) {
    return { ok: false, error: `artifact unreadable: ${error instanceof Error ? error.message : String(error)}` };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<TrackRIndependentReviewRecord>;
    return { ok: true, raw, record: parsed };
  } catch {
    // A non-JSON file at the verdict path (for example, an intake receipt's markdown
    // content copy-pasted here) is malformed — fail closed rather than guess at intent.
    return { ok: false, error: 'verdict artifact is not valid JSON — malformed verdict' };
  }
}

/**
 * Resolve one lane's selected review for the current, non-superseded issued packet.
 * `expectedRunId`/`expectedPacketHash`, when supplied, must match the resolved current
 * candidate exactly — otherwise the caller is bound to a packet that has moved out from
 * under it (PACKET_BINDING_CHANGED), which must never silently re-target a newer run.
 */
export function resolveTrackRP3SelectedReview(args: {
  lane: TrackRP3ReviewLane;
  repoRoot?: string;
  expectedRunId?: string;
  expectedPacketHash?: string;
}): TrackRP3SelectedReviewResult {
  const repoRoot = args.repoRoot ?? process.cwd();
  const intake = runTrackRP3GovernanceIntake({ repoRoot });
  if (!intake.ok) {
    return { ok: false, blockedReason: 'INTAKE_UNAVAILABLE', errors: intake.errors };
  }

  const context = intake.candidate;
  if (args.expectedRunId && args.expectedRunId !== context.workflow_run_id) {
    return {
      ok: false,
      blockedReason: 'PACKET_BINDING_CHANGED',
      errors: [
        `expected workflow_run_id ${args.expectedRunId} but current candidate is ${context.workflow_run_id}`,
      ],
    };
  }
  if (args.expectedPacketHash && args.expectedPacketHash !== context.packet_hash) {
    return {
      ok: false,
      blockedReason: 'PACKET_BINDING_CHANGED',
      errors: [
        `expected packet_hash ${args.expectedPacketHash} but current candidate is ${context.packet_hash}`,
      ],
    };
  }

  const artifactPath = trackRP3ReviewVerdictArtifactPath({
    workflowRunId: context.workflow_run_id,
    lane: args.lane,
  });
  const absolutePath = join(repoRoot, artifactPath);

  if (!existsSync(absolutePath)) {
    return {
      ok: true,
      review: pendingReview({
        lane: args.lane,
        context,
        artifactPath,
        blocked_reasons: ['verdict_artifact_missing'],
      }),
    };
  }

  const artifactHash = hashArtifactFile(absolutePath);
  const loaded = readVerdictArtifact(absolutePath);
  if (!loaded.ok) {
    return {
      ok: true,
      review: pendingReview({
        lane: args.lane,
        context,
        artifactPath,
        artifactHash,
        blocked_reasons: [`malformed_verdict_artifact: ${loaded.error}`],
      }),
    };
  }

  const record = loaded.record;
  const blocked_reasons: string[] = [];

  if (record.reviewer !== args.lane) {
    blocked_reasons.push('agent_identity_mismatch');
  }

  const structural = validateTrackRIndependentReviewRecord(record, {
    workflow_run_id: context.workflow_run_id,
    packet_hash: context.packet_hash,
    journal_id: context.journal_id,
    production_commit: context.observed_production_commit,
  });
  if (!structural.ok) {
    blocked_reasons.push(...structural.errors);
  }

  const claimedHash = (record as { artifact_hash?: string }).artifact_hash;
  if (claimedHash && claimedHash !== artifactHash) {
    blocked_reasons.push('artifact_hash_mismatch');
  }

  const agentId = args.lane === 'ZEUS' ? 'mobius:agent:zeus' : 'mobius:agent:eve';
  const badge = getAgentBadge(agentId);
  let independenceStatus: 'verified' | 'unverified' = 'unverified';
  if (!badge) {
    blocked_reasons.push('badge_not_found');
  } else {
    const badgeCheck = validateAgentBadge(badge);
    if (!badgeCheck.ok) {
      blocked_reasons.push(`badge_invalid: ${badgeCheck.code}`);
    } else {
      const permitted = validateBadgePermitsParticipation(agentId, 'issue_attestation');
      if (!permitted.ok) {
        blocked_reasons.push(`badge_permission_denied: ${permitted.code}`);
      } else if (structural.ok && record.reviewer === args.lane) {
        independenceStatus = record.model_provenance ? 'verified' : 'unverified';
      }
    }
  }

  if (blocked_reasons.length > 0) {
    return {
      ok: true,
      review: pendingReview({
        lane: args.lane,
        context,
        artifactPath,
        artifactHash,
        blocked_reasons,
      }),
    };
  }

  const verdict = (record.verdict as TrackRIndependentReviewVerdict).toUpperCase() as TrackRIndependentReviewVerdict;

  return {
    ok: true,
    review: {
      agent: args.lane,
      packet_run_id: context.workflow_run_id,
      packet_hash: context.packet_hash,
      verdict,
      artifact_path: artifactPath,
      artifact_hash: artifactHash,
      artifact_present: true,
      source: 'committed',
      issued_at: record.reviewed_at ?? null,
      model_provenance: record.model_provenance ?? null,
      evidence_provenance: record.evidence_refs ?? [],
      independence_status: independenceStatus,
      human_approval: false,
      execution_authorized: false,
      blocked_reasons: [],
    },
  };
}

/**
 * Cross-lane independence check: two verdicts that share the same model_provenance,
 * reviewed_at timestamp, and evidence_refs are presumptively the same underlying review
 * process wearing two names, not two independent reviewers. This must fail closed —
 * it does not by itself invalidate either verdict's structural validity, but it means
 * neither lane may be reported as independently verified.
 */
export function assertReviewLanesAreIndependent(
  zeus: TrackRP3SelectedReview,
  eve: TrackRP3SelectedReview,
): { independent: boolean; reason?: string } {
  if (zeus.verdict === 'PENDING' || eve.verdict === 'PENDING') {
    return { independent: false, reason: 'one_or_both_lanes_pending' };
  }
  const sameProvenance =
    zeus.model_provenance != null &&
    zeus.model_provenance === eve.model_provenance &&
    zeus.issued_at === eve.issued_at &&
    JSON.stringify([...zeus.evidence_provenance].sort()) ===
      JSON.stringify([...eve.evidence_provenance].sort());
  if (sameProvenance) {
    return { independent: false, reason: 'shared_underlying_review_identity' };
  }
  return { independent: true };
}
