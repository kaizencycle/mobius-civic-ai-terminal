// JOB-17 (C-417) — Track R P3 durable review evidence.
// Run: tsx tests/contract/trackRP3ReviewDurability.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  assertReviewLanesAreIndependent,
  resolveTrackRP3SelectedReview,
} from '@/lib/watchdog/batchRepair/trackRP3SelectedReview';
import {
  runTrackRP3GovernanceIntake,
  type TrackRP3ReviewContext,
} from '@/lib/watchdog/batchRepair/trackRP3GovernanceIntake';
import {
  trackRP3ReviewArtifactPath,
  trackRP3ReviewVerdictArtifactPath,
  renderTrackRP3MachineVerificationReceipt,
  type TrackRIndependentReviewRecord,
} from '@/lib/watchdog/batchRepair/trackRP3ReviewArtifacts';
import { loadIssuedPacketRegistry } from '@/lib/watchdog/batchRepair/p3IssuedPacketRegistry';
import { buildTrackRP3IntakeObservability } from '@/lib/trackR/p3IntakeObservability';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const LATEST_RUN = '32650057599';
const LATEST_PACKET_HASH = '82bfe16c7a13b3a8e73720debf50161c4a12da9e022e3682cb1d93276cfd96d9';
const SUPERSEDED_RUN = '32264177719';

function copyRepoEvidenceTree(tempRoot: string, options?: { runs?: string[] }): void {
  const source = join(REPO_ROOT, 'docs/epicon/cycles/C-407/p3-preparation');
  const target = join(tempRoot, 'docs/epicon/cycles/C-407/p3-preparation');
  mkdirSync(join(tempRoot, 'docs/epicon/cycles/C-408/track-r-p3-review'), { recursive: true });
  mkdirSync(join(target, 'runs'), { recursive: true });
  writeFileSync(
    join(tempRoot, 'docs/epicon/cycles/C-408/track-r-p3-review/packet-review-registry.json'),
    readFileSync(
      join(REPO_ROOT, 'docs/epicon/cycles/C-408/track-r-p3-review/packet-review-registry.json'),
      'utf8',
    ),
    'utf8',
  );

  const loaded = loadIssuedPacketRegistry(REPO_ROOT);
  assert.equal(loaded.ok, true);
  if (!loaded.ok) return;

  const selectedRuns = options?.runs ?? loaded.registry.entries.map((entry) => entry.workflow_run_id);
  for (const runId of selectedRuns) {
    cpSync(join(source, 'runs', runId), join(target, 'runs', runId), { recursive: true });
  }

  const filtered = {
    ...loaded.registry,
    entries: loaded.registry.entries.filter((entry) => selectedRuns.includes(entry.workflow_run_id)),
  };
  writeFileSync(join(target, 'issued-packet-registry.json'), `${JSON.stringify(filtered, null, 2)}\n`, 'utf8');
}

function candidateContext(tempRoot: string): TrackRP3ReviewContext {
  const intake = runTrackRP3GovernanceIntake({ repoRoot: tempRoot });
  assert.equal(intake.ok, true);
  if (!intake.ok) throw new Error('intake unexpectedly blocked');
  return intake.candidate;
}

function writeVerdictArtifact(args: {
  tempRoot: string;
  runId: string;
  lane: 'ZEUS' | 'EVE';
  record: Partial<TrackRIndependentReviewRecord> & { artifact_hash?: string };
}): string {
  const path = trackRP3ReviewVerdictArtifactPath({ workflowRunId: args.runId, lane: args.lane });
  const abs = join(args.tempRoot, path);
  mkdirSync(abs.replace(/\/[^/]*$/, ''), { recursive: true });
  writeFileSync(abs, `${JSON.stringify(args.record, null, 2)}\n`, 'utf8');
  return path;
}

describe('Track R P3 durable review evidence (JOB-17)', () => {
  it('exact packet resolves successfully when durable evidence is valid', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'track-r-p3-review-'));
    try {
      copyRepoEvidenceTree(tempRoot, { runs: [LATEST_RUN] });
      const ctx = candidateContext(tempRoot);
      writeVerdictArtifact({
        tempRoot,
        runId: ctx.workflow_run_id,
        lane: 'ZEUS',
        record: {
          reviewer: 'ZEUS',
          workflow_run_id: ctx.workflow_run_id,
          packet_hash: ctx.packet_hash,
          journal_id: ctx.journal_id,
          production_commit: ctx.observed_production_commit,
          capture_id: ctx.capture_id,
          verdict: 'ADOPT',
          reviewed_at: '2026-08-28T00:00:00.000Z',
          evidence_refs: ['docs/epicon/cycles/C-407/p3-preparation/runs/' + ctx.workflow_run_id + '/operator-packet.json'],
          model_provenance: 'zeus-lane-model-x',
        },
      });
      const result = resolveTrackRP3SelectedReview({ lane: 'ZEUS', repoRoot: tempRoot, expectedRunId: LATEST_RUN });
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.review.verdict, 'ADOPT');
      assert.equal(result.review.artifact_present, true);
      assert.equal(result.review.source, 'committed');
      assert.equal(result.review.independence_status, 'verified');
      assert.equal(result.review.human_approval, false);
      assert.equal(result.review.execution_authorized, false);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('missing ZEUS verdict returns PENDING', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'track-r-p3-review-'));
    try {
      copyRepoEvidenceTree(tempRoot, { runs: [LATEST_RUN] });
      const result = resolveTrackRP3SelectedReview({ lane: 'ZEUS', repoRoot: tempRoot });
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.review.verdict, 'PENDING');
      assert.equal(result.review.artifact_present, false);
      assert.equal(result.review.source, 'absent');
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('missing EVE verdict returns PENDING', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'track-r-p3-review-'));
    try {
      copyRepoEvidenceTree(tempRoot, { runs: [LATEST_RUN] });
      const result = resolveTrackRP3SelectedReview({ lane: 'EVE', repoRoot: tempRoot });
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.review.verdict, 'PENDING');
      assert.equal(result.review.artifact_present, false);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('intake (machine-verification) receipt does not satisfy verdict requirements', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'track-r-p3-review-'));
    try {
      copyRepoEvidenceTree(tempRoot, { runs: [LATEST_RUN] });
      const ctx = candidateContext(tempRoot);
      // Write only the machine-verification receipt (.md) — not the verdict sidecar.
      const receiptPath = trackRP3ReviewArtifactPath({ workflowRunId: ctx.workflow_run_id, lane: 'ZEUS' });
      const abs = join(tempRoot, receiptPath);
      mkdirSync(abs.replace(/\/[^/]*$/, ''), { recursive: true });
      writeFileSync(
        abs,
        renderTrackRP3MachineVerificationReceipt({
          lane: 'ZEUS',
          context: ctx,
          generatedAt: '2026-08-28T00:00:00.000Z',
          intakeStatus: 'AWAITING_INDEPENDENT_REVIEW',
        }),
        'utf8',
      );
      const result = resolveTrackRP3SelectedReview({ lane: 'ZEUS', repoRoot: tempRoot });
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.review.verdict, 'PENDING');
      assert.equal(result.review.artifact_present, false, 'receipt .md must not satisfy the verdict sidecar path');
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('mismatched packet hash is rejected', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'track-r-p3-review-'));
    try {
      copyRepoEvidenceTree(tempRoot, { runs: [LATEST_RUN] });
      const ctx = candidateContext(tempRoot);
      writeVerdictArtifact({
        tempRoot,
        runId: ctx.workflow_run_id,
        lane: 'ZEUS',
        record: {
          reviewer: 'ZEUS',
          workflow_run_id: ctx.workflow_run_id,
          packet_hash: 'deadbeef'.repeat(8),
          journal_id: ctx.journal_id,
          production_commit: ctx.observed_production_commit,
          capture_id: ctx.capture_id,
          verdict: 'ADOPT',
          reviewed_at: '2026-08-28T00:00:00.000Z',
          evidence_refs: ['x'],
        },
      });
      const result = resolveTrackRP3SelectedReview({ lane: 'ZEUS', repoRoot: tempRoot });
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.review.verdict, 'PENDING');
      assert.ok(result.review.blocked_reasons.includes('packet_hash_binding_failed'));
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('a superseded run cannot satisfy the current candidate binding', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'track-r-p3-review-'));
    try {
      copyRepoEvidenceTree(tempRoot, { runs: [LATEST_RUN, SUPERSEDED_RUN] });
      const ctx = candidateContext(tempRoot);
      assert.equal(ctx.workflow_run_id, LATEST_RUN);
      // A verdict record bound to the superseded run's identity, placed at the CURRENT
      // candidate's artifact path, must be rejected — not silently accepted because a
      // file happens to exist at the right path.
      writeVerdictArtifact({
        tempRoot,
        runId: ctx.workflow_run_id,
        lane: 'EVE',
        record: {
          reviewer: 'EVE',
          workflow_run_id: SUPERSEDED_RUN,
          packet_hash: '271607643453b15a7a1170021fb2e7d4c3c0889de09b7acd12f04f35060e21f6',
          journal_id: 'stale-journal',
          production_commit: 'stale-commit',
          capture_id: ctx.capture_id,
          verdict: 'ADOPT',
          reviewed_at: '2026-08-19T00:00:00.000Z',
          evidence_refs: ['x'],
        },
      });
      const result = resolveTrackRP3SelectedReview({ lane: 'EVE', repoRoot: tempRoot });
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.review.verdict, 'PENDING');
      assert.ok(result.review.blocked_reasons.includes('workflow_run_id_binding_failed'));
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('missing artifact path resolves to PENDING, never to an inferred verdict', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'track-r-p3-review-'));
    try {
      copyRepoEvidenceTree(tempRoot, { runs: [LATEST_RUN] });
      const result = resolveTrackRP3SelectedReview({ lane: 'EVE', repoRoot: tempRoot });
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.review.artifact_path, trackRP3ReviewVerdictArtifactPath({ workflowRunId: LATEST_RUN, lane: 'EVE' }));
      assert.equal(result.review.verdict, 'PENDING');
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('a malformed verdict fails closed to PENDING', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'track-r-p3-review-'));
    try {
      copyRepoEvidenceTree(tempRoot, { runs: [LATEST_RUN] });
      const ctx = candidateContext(tempRoot);
      writeVerdictArtifact({
        tempRoot,
        runId: ctx.workflow_run_id,
        lane: 'ZEUS',
        record: {
          reviewer: 'ZEUS',
          workflow_run_id: ctx.workflow_run_id,
          packet_hash: ctx.packet_hash,
          journal_id: ctx.journal_id,
          production_commit: ctx.observed_production_commit,
          capture_id: ctx.capture_id,
          verdict: 'MAYBE' as TrackRIndependentReviewRecord['verdict'],
          reviewed_at: '2026-08-28T00:00:00.000Z',
          evidence_refs: ['x'],
        },
      });
      const result = resolveTrackRP3SelectedReview({ lane: 'ZEUS', repoRoot: tempRoot });
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.review.verdict, 'PENDING');
      assert.ok(result.review.blocked_reasons.some((r) => r.includes('verdict_must_be')));
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('a non-JSON file at the verdict path is rejected as malformed, not parsed leniently', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'track-r-p3-review-'));
    try {
      copyRepoEvidenceTree(tempRoot, { runs: [LATEST_RUN] });
      const ctx = candidateContext(tempRoot);
      const path = trackRP3ReviewVerdictArtifactPath({ workflowRunId: ctx.workflow_run_id, lane: 'EVE' });
      const abs = join(tempRoot, path);
      mkdirSync(abs.replace(/\/[^/]*$/, ''), { recursive: true });
      writeFileSync(abs, '# not json\nADOPT\n', 'utf8');
      const result = resolveTrackRP3SelectedReview({ lane: 'EVE', repoRoot: tempRoot });
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.review.verdict, 'PENDING');
      assert.equal(result.review.artifact_present, true, 'a file exists — but is malformed, not a valid verdict');
      assert.ok(result.review.blocked_reasons.some((r) => r.startsWith('malformed_verdict_artifact')));
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('unknown agent identity (reviewer field mismatch) is rejected', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'track-r-p3-review-'));
    try {
      copyRepoEvidenceTree(tempRoot, { runs: [LATEST_RUN] });
      const ctx = candidateContext(tempRoot);
      writeVerdictArtifact({
        tempRoot,
        runId: ctx.workflow_run_id,
        lane: 'ZEUS',
        record: {
          reviewer: 'EVE',
          workflow_run_id: ctx.workflow_run_id,
          packet_hash: ctx.packet_hash,
          journal_id: ctx.journal_id,
          production_commit: ctx.observed_production_commit,
          capture_id: ctx.capture_id,
          verdict: 'ADOPT',
          reviewed_at: '2026-08-28T00:00:00.000Z',
          evidence_refs: ['x'],
        },
      });
      const result = resolveTrackRP3SelectedReview({ lane: 'ZEUS', repoRoot: tempRoot });
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.review.verdict, 'PENDING');
      assert.ok(result.review.blocked_reasons.includes('agent_identity_mismatch'));
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('an artifact_hash claim that does not match the file is rejected', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'track-r-p3-review-'));
    try {
      copyRepoEvidenceTree(tempRoot, { runs: [LATEST_RUN] });
      const ctx = candidateContext(tempRoot);
      writeVerdictArtifact({
        tempRoot,
        runId: ctx.workflow_run_id,
        lane: 'ZEUS',
        record: {
          reviewer: 'ZEUS',
          workflow_run_id: ctx.workflow_run_id,
          packet_hash: ctx.packet_hash,
          journal_id: ctx.journal_id,
          production_commit: ctx.observed_production_commit,
          capture_id: ctx.capture_id,
          verdict: 'ADOPT',
          reviewed_at: '2026-08-28T00:00:00.000Z',
          evidence_refs: ['x'],
          artifact_hash: '0'.repeat(64),
        },
      });
      const result = resolveTrackRP3SelectedReview({ lane: 'ZEUS', repoRoot: tempRoot });
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.review.verdict, 'PENDING');
      assert.ok(result.review.blocked_reasons.includes('artifact_hash_mismatch'));
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('reviewer independence remains unproven until supported by model_provenance', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'track-r-p3-review-'));
    try {
      copyRepoEvidenceTree(tempRoot, { runs: [LATEST_RUN] });
      const ctx = candidateContext(tempRoot);
      writeVerdictArtifact({
        tempRoot,
        runId: ctx.workflow_run_id,
        lane: 'ZEUS',
        record: {
          reviewer: 'ZEUS',
          workflow_run_id: ctx.workflow_run_id,
          packet_hash: ctx.packet_hash,
          journal_id: ctx.journal_id,
          production_commit: ctx.observed_production_commit,
          capture_id: ctx.capture_id,
          verdict: 'ADOPT',
          reviewed_at: '2026-08-28T00:00:00.000Z',
          evidence_refs: ['x'],
          // model_provenance intentionally omitted
        },
      });
      const result = resolveTrackRP3SelectedReview({ lane: 'ZEUS', repoRoot: tempRoot });
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.review.verdict, 'ADOPT');
      assert.equal(result.review.independence_status, 'unverified');
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('two lanes backed by the same underlying review identity are not independent', () => {
    const zeus = {
      agent: 'ZEUS' as const,
      packet_run_id: LATEST_RUN,
      packet_hash: LATEST_PACKET_HASH,
      verdict: 'ADOPT' as const,
      artifact_path: 'x',
      artifact_hash: 'h',
      artifact_present: true,
      source: 'committed' as const,
      issued_at: '2026-08-28T00:00:00.000Z',
      model_provenance: 'shared-model',
      evidence_provenance: ['a', 'b'],
      independence_status: 'verified' as const,
      human_approval: false as const,
      execution_authorized: false as const,
      blocked_reasons: [],
    };
    const eve = { ...zeus, agent: 'EVE' as const };
    const result = assertReviewLanesAreIndependent(zeus, eve);
    assert.equal(result.independent, false);
    assert.equal(result.reason, 'shared_underlying_review_identity');
  });

  it('two lanes with distinct provenance are independent', () => {
    const zeus = {
      agent: 'ZEUS' as const,
      packet_run_id: LATEST_RUN,
      packet_hash: LATEST_PACKET_HASH,
      verdict: 'ADOPT' as const,
      artifact_path: 'x',
      artifact_hash: 'h1',
      artifact_present: true,
      source: 'committed' as const,
      issued_at: '2026-08-28T00:00:00.000Z',
      model_provenance: 'zeus-model',
      evidence_provenance: ['a'],
      independence_status: 'verified' as const,
      human_approval: false as const,
      execution_authorized: false as const,
      blocked_reasons: [],
    };
    const eve = {
      ...zeus,
      agent: 'EVE' as const,
      artifact_hash: 'h2',
      model_provenance: 'eve-model',
      evidence_provenance: ['b'],
    };
    const result = assertReviewLanesAreIndependent(zeus, eve);
    assert.equal(result.independent, true);
  });

  it('PACKET_BINDING_CHANGED when caller-expected run_id does not match the resolved candidate', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'track-r-p3-review-'));
    try {
      copyRepoEvidenceTree(tempRoot, { runs: [LATEST_RUN] });
      const result = resolveTrackRP3SelectedReview({
        lane: 'ZEUS',
        repoRoot: tempRoot,
        expectedRunId: '99999999999',
      });
      assert.equal(result.ok, false);
      if (result.ok) return;
      assert.equal(result.blockedReason, 'PACKET_BINDING_CHANGED');
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('PACKET_BINDING_CHANGED when caller-expected packet_hash does not match', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'track-r-p3-review-'));
    try {
      copyRepoEvidenceTree(tempRoot, { runs: [LATEST_RUN] });
      const result = resolveTrackRP3SelectedReview({
        lane: 'ZEUS',
        repoRoot: tempRoot,
        expectedRunId: LATEST_RUN,
        expectedPacketHash: 'deadbeef'.repeat(8),
      });
      assert.equal(result.ok, false);
      if (result.ok) return;
      assert.equal(result.blockedReason, 'PACKET_BINDING_CHANGED');
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('human_approval and execution_authorized are always false, verdict present or not', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'track-r-p3-review-'));
    try {
      copyRepoEvidenceTree(tempRoot, { runs: [LATEST_RUN] });
      const pending = resolveTrackRP3SelectedReview({ lane: 'ZEUS', repoRoot: tempRoot });
      assert.equal(pending.ok, true);
      if (pending.ok) {
        assert.equal(pending.review.human_approval, false);
        assert.equal(pending.review.execution_authorized, false);
      }

      const ctx = candidateContext(tempRoot);
      writeVerdictArtifact({
        tempRoot,
        runId: ctx.workflow_run_id,
        lane: 'EVE',
        record: {
          reviewer: 'EVE',
          workflow_run_id: ctx.workflow_run_id,
          packet_hash: ctx.packet_hash,
          journal_id: ctx.journal_id,
          production_commit: ctx.observed_production_commit,
          capture_id: ctx.capture_id,
          verdict: 'ADOPT',
          reviewed_at: '2026-08-28T00:00:00.000Z',
          evidence_refs: ['x'],
        },
      });
      const withVerdict = resolveTrackRP3SelectedReview({ lane: 'EVE', repoRoot: tempRoot });
      assert.equal(withVerdict.ok, true);
      if (withVerdict.ok) {
        assert.equal(withVerdict.review.human_approval, false);
        assert.equal(withVerdict.review.execution_authorized, false);
      }
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('the exact JOB-17 packet binding resolves against the real repository, both lanes PENDING', () => {
    // No temp copy here: proves the actual committed evidence tree (not a fixture)
    // durably resolves the exact run/hash named in the JOB-17 handoff.
    const zeus = resolveTrackRP3SelectedReview({ lane: 'ZEUS', repoRoot: REPO_ROOT, expectedRunId: LATEST_RUN, expectedPacketHash: LATEST_PACKET_HASH });
    const eve = resolveTrackRP3SelectedReview({ lane: 'EVE', repoRoot: REPO_ROOT, expectedRunId: LATEST_RUN, expectedPacketHash: LATEST_PACKET_HASH });
    assert.equal(zeus.ok, true);
    assert.equal(eve.ok, true);
    if (!zeus.ok || !eve.ok) return;
    assert.equal(zeus.review.packet_run_id, LATEST_RUN);
    assert.equal(zeus.review.packet_hash, LATEST_PACKET_HASH);
    assert.equal(zeus.review.verdict, 'PENDING');
    assert.equal(eve.review.verdict, 'PENDING');
  });

  it('read-only observability surfaces reviews.zeus/eve as an explicit pending shape', async () => {
    const status = await buildTrackRP3IntakeObservability({ workflowRunId: LATEST_RUN, repoRoot: REPO_ROOT });
    assert.equal(status.execution_authorized, false);
    assert.equal(status.reviews.zeus.status, 'PENDING');
    assert.equal(status.reviews.eve.status, 'PENDING');
    assert.notEqual(status.reviews.zeus.artifact_path, status.reviews.eve.artifact_path);
  });

  it('runtime-only references cannot masquerade as committed evidence: resolver reads no KV, no network', () => {
    const source = readFileSync(
      join(REPO_ROOT, 'lib/watchdog/batchRepair/trackRP3SelectedReview.ts'),
      'utf8',
    );
    assert.doesNotMatch(source, /kvGet|kvSet|kvGetOrThrow/);
    assert.doesNotMatch(source, /\bfetch\(/);
    assert.doesNotMatch(source, /@\/lib\/kv\//);
  });

  it('no Track R apply path or production KV mutation is reachable from the durability sync script', () => {
    const scriptSource = readFileSync(
      join(REPO_ROOT, 'scripts/track-r-p3-review-durability-sync.ts'),
      'utf8',
    );
    const resolverSource = readFileSync(
      join(REPO_ROOT, 'lib/watchdog/batchRepair/trackRP3SelectedReview.ts'),
      'utf8',
    );
    for (const source of [scriptSource, resolverSource]) {
      assert.doesNotMatch(source, /runBatchApply/);
      assert.doesNotMatch(source, /track-r:batch-apply/);
      assert.doesNotMatch(source, /BATCH_EXECUTION_FEATURE_FLAG/);
      assert.doesNotMatch(source, /kvSet|kvGet|kvGetOrThrow/);
    }
  });
});
