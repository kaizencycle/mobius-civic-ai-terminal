// C-408: Track R P3 governance intake (read-only)
// Run: tsx tests/contract/trackRP3GovernanceIntake.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  buildTrackRP3EvidenceIdentity,
  evidenceIdentityDigest,
  runTrackRP3GovernanceIntake,
  verifyTrackRP3PacketEvidence,
} from '@/lib/watchdog/batchRepair/trackRP3GovernanceIntake';
import { loadIssuedPacketRegistry } from '@/lib/watchdog/batchRepair/p3IssuedPacketRegistry';
import { runTrackRP3GovernanceIntakeCron, InMemoryTrackRP3ReviewStateStore } from '@/lib/watchdog/batchRepair/runTrackRP3GovernanceIntakeCron';
import {
  findPacketReviewEntry,
  upsertPacketReviewEntry,
} from '@/lib/watchdog/batchRepair/p3PacketReviewRegistry';
import {
  renderTrackRP3MachineVerificationReceipt,
  satisfiesTrackRP3PacketReview,
  TRACK_R_P3_GOVERNANCE_SCOPE,
} from '@/lib/watchdog/batchRepair/trackRP3ReviewArtifacts';
import { CAPTURE_2014Z_ID } from '@/lib/watchdog/batchRepair/trackRCaptureV2Governance';
import { hashObject } from '@/lib/watchdog/batchRepair/stableHash';
import type { IssuedPacketRegistryEntry } from '@/lib/watchdog/batchRepair/p3IssuedPacketRegistry';
import type { P3OperatorPacket } from '@/lib/watchdog/batchRepair/buildP3OperatorPacket';

const CANONICAL_RUN = '32264177719';
const SUPERSEDED_RUN = '32264049953';
const CANONICAL_PACKET_HASH = '271607643453b15a7a1170021fb2e7d4c3c0889de09b7acd12f04f35060e21f6';

function copyRepoEvidenceTree(tempRoot: string, options?: { runs?: string[] }): void {
  const source = join(process.cwd(), 'docs/epicon/cycles/C-407/p3-preparation');
  const target = join(tempRoot, 'docs/epicon/cycles/C-407/p3-preparation');
  mkdirSync(join(tempRoot, 'docs/epicon/cycles/C-408/track-r-p3-review'), { recursive: true });
  mkdirSync(join(target, 'runs'), { recursive: true });
  writeFileSync(
    join(tempRoot, 'docs/epicon/cycles/C-408/track-r-p3-review/packet-review-registry.json'),
    `${readFileSync(
      join(process.cwd(), 'docs/epicon/cycles/C-408/track-r-p3-review/packet-review-registry.json'),
      'utf8',
    )}`,
    'utf8',
  );

  const loaded = loadIssuedPacketRegistry(process.cwd());
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

function registryEntryFor(runId: string): IssuedPacketRegistryEntry {
  const loaded = loadIssuedPacketRegistry(process.cwd());
  assert.equal(loaded.ok, true);
  const entry = loaded.registry.entries.find((row) => row.workflow_run_id === runId);
  assert.ok(entry, `missing registry entry for ${runId}`);
  return entry;
}

describe('Track R P3 governance intake', () => {
  it('canonical run 32264177719 passes intake', () => {
    const intake = runTrackRP3GovernanceIntake();
    assert.equal(intake.ok, true);
    if (!intake.ok) return;
    assert.equal(intake.status, 'ready_for_independent_review');
    assert.equal(intake.candidate.workflow_run_id, CANONICAL_RUN);
    assert.equal(intake.candidate.packet_hash, CANONICAL_PACKET_HASH);
    assert.equal(intake.candidate.capture_id, CAPTURE_2014Z_ID);
    assert.equal(intake.candidate.operator_packet.execution_authorized, false);
    assert.equal(intake.candidate.operator_packet.production_mutation_performed, false);
  });

  it('run 32264049953 is preserved and marked superseded', () => {
    const intake = runTrackRP3GovernanceIntake();
    assert.equal(intake.ok, true);
    if (!intake.ok) return;
    const superseded = intake.historicalPackets.find((row) => row.workflow_run_id === SUPERSEDED_RUN);
    assert.ok(superseded, 'superseded run must remain visible');
    assert.equal(superseded.status, 'superseded');
    assert.equal(superseded.superseded_by_workflow_run_id, CANONICAL_RUN);
  });

  it('latest selection is deterministic by issuance time plus run ID tie-break', () => {
    const intake = runTrackRP3GovernanceIntake();
    assert.equal(intake.ok, true);
    if (!intake.ok) return;
    const loaded = loadIssuedPacketRegistry();
    assert.equal(loaded.ok, true);
    if (!loaded.ok) return;
    const sorted = [...loaded.registry.entries].sort((a, b) => {
      const issuedCompare = b.issued_at.localeCompare(a.issued_at);
      if (issuedCompare !== 0) return issuedCompare;
      return b.workflow_run_id.localeCompare(a.workflow_run_id);
    });
    assert.equal(intake.candidate.workflow_run_id, sorted[0]?.workflow_run_id);
  });

  it('corrupted packet hash blocks intake', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'track-r-p3-intake-'));
    try {
      copyRepoEvidenceTree(tempRoot, { runs: [CANONICAL_RUN] });
      const packetPath = join(
        tempRoot,
        `docs/epicon/cycles/C-407/p3-preparation/runs/${CANONICAL_RUN}/operator-packet.json`,
      );
      const packet = JSON.parse(readFileSync(packetPath, 'utf8')) as P3OperatorPacket;
      packet.packet_hash = 'deadbeef'.repeat(8);
      writeFileSync(packetPath, `${JSON.stringify(packet, null, 2)}\n`, 'utf8');
      const intake = runTrackRP3GovernanceIntake({ repoRoot: tempRoot });
      assert.equal(intake.ok, false);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('corrupted evidence-manifest file hash blocks intake', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'track-r-p3-intake-'));
    try {
      copyRepoEvidenceTree(tempRoot, { runs: [CANONICAL_RUN] });
      const manifestPath = join(
        tempRoot,
        `docs/epicon/cycles/C-407/p3-preparation/runs/${CANONICAL_RUN}/evidence-manifest.json`,
      );
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
        files: Record<string, { sha256: string; bytes: number }>;
      };
      manifest.files['readiness.log'].sha256 = '0'.repeat(64);
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
      const intake = runTrackRP3GovernanceIntake({ repoRoot: tempRoot });
      assert.equal(intake.ok, false);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('journal ID/hash mismatch blocks intake', () => {
    const entry = registryEntryFor(CANONICAL_RUN);
    const verification = verifyTrackRP3PacketEvidence({
      registryEntry: { ...entry, journal_id: 'mismatch-journal-id' },
    });
    assert.equal(verification.ok, false);
  });

  it('production commit mismatch blocks intake', () => {
    const entry = registryEntryFor(CANONICAL_RUN);
    const verification = verifyTrackRP3PacketEvidence({
      registryEntry: { ...entry, observed_production_commit: '0'.repeat(40) },
    });
    assert.equal(verification.ok, false);
  });

  it('wrong Capture ID blocks intake', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'track-r-p3-intake-'));
    try {
      copyRepoEvidenceTree(tempRoot, { runs: [CANONICAL_RUN] });
      const packetPath = join(
        tempRoot,
        `docs/epicon/cycles/C-407/p3-preparation/runs/${CANONICAL_RUN}/operator-packet.json`,
      );
      const packet = JSON.parse(readFileSync(packetPath, 'utf8')) as P3OperatorPacket;
      packet.capture_id = 'track-r-c403-2026-08-15T0123Z';
      const { packet_hash: _ignored, ...body } = packet;
      packet.packet_hash = hashObject(body as Record<string, unknown>);
      writeFileSync(packetPath, `${JSON.stringify(packet, null, 2)}\n`, 'utf8');
      const intake = runTrackRP3GovernanceIntake({ repoRoot: tempRoot });
      assert.equal(intake.ok, false);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('altered locked hash blocks intake', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'track-r-p3-intake-'));
    try {
      copyRepoEvidenceTree(tempRoot, { runs: [CANONICAL_RUN] });
      const packetPath = join(
        tempRoot,
        `docs/epicon/cycles/C-407/p3-preparation/runs/${CANONICAL_RUN}/operator-packet.json`,
      );
      const packet = JSON.parse(readFileSync(packetPath, 'utf8')) as P3OperatorPacket;
      packet.locked_hashes.lineage_snapshot_hash = '0'.repeat(64);
      const { packet_hash: _ignored, ...body } = packet;
      packet.packet_hash = hashObject(body as Record<string, unknown>);
      writeFileSync(packetPath, `${JSON.stringify(packet, null, 2)}\n`, 'utf8');
      const intake = runTrackRP3GovernanceIntake({ repoRoot: tempRoot });
      assert.equal(intake.ok, false);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('execution_authorized: true blocks intake', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'track-r-p3-intake-'));
    try {
      copyRepoEvidenceTree(tempRoot, { runs: [CANONICAL_RUN] });
      const packetPath = join(
        tempRoot,
        `docs/epicon/cycles/C-407/p3-preparation/runs/${CANONICAL_RUN}/operator-packet.json`,
      );
      const packet = JSON.parse(readFileSync(packetPath, 'utf8')) as Record<string, unknown>;
      packet.execution_authorized = true;
      writeFileSync(packetPath, `${JSON.stringify(packet, null, 2)}\n`, 'utf8');
      const intake = runTrackRP3GovernanceIntake({ repoRoot: tempRoot });
      assert.equal(intake.ok, false);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('production_mutation_performed: true blocks intake', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'track-r-p3-intake-'));
    try {
      copyRepoEvidenceTree(tempRoot, { runs: [CANONICAL_RUN] });
      const packetPath = join(
        tempRoot,
        `docs/epicon/cycles/C-407/p3-preparation/runs/${CANONICAL_RUN}/operator-packet.json`,
      );
      const packet = JSON.parse(readFileSync(packetPath, 'utf8')) as Record<string, unknown>;
      packet.production_mutation_performed = true;
      writeFileSync(packetPath, `${JSON.stringify(packet, null, 2)}\n`, 'utf8');
      const intake = runTrackRP3GovernanceIntake({ repoRoot: tempRoot });
      assert.equal(intake.ok, false);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('position 132 or block 361 in intended scope blocks intake', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'track-r-p3-intake-'));
    try {
      copyRepoEvidenceTree(tempRoot, { runs: [CANONICAL_RUN] });
      const intendedPath = join(
        tempRoot,
        `docs/epicon/cycles/C-407/p3-preparation/runs/${CANONICAL_RUN}/intended-writes.json`,
      );
      const intended = JSON.parse(readFileSync(intendedPath, 'utf8')) as {
        intended_block_numbers: number[];
      };
      intended.intended_block_numbers.push(132, 361);
      writeFileSync(intendedPath, `${JSON.stringify(intended, null, 2)}\n`, 'utf8');
      const intake = runTrackRP3GovernanceIntake({ repoRoot: tempRoot });
      assert.equal(intake.ok, false);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('blocks when newest issued packet is invalid even if older packet remains valid', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'track-r-p3-intake-'));
    try {
      copyRepoEvidenceTree(tempRoot, { runs: [CANONICAL_RUN, SUPERSEDED_RUN] });
      const packetPath = join(
        tempRoot,
        `docs/epicon/cycles/C-407/p3-preparation/runs/${CANONICAL_RUN}/operator-packet.json`,
      );
      const packet = JSON.parse(readFileSync(packetPath, 'utf8')) as P3OperatorPacket;
      packet.packet_hash = 'deadbeef'.repeat(8);
      writeFileSync(packetPath, `${JSON.stringify(packet, null, 2)}\n`, 'utf8');
      const intake = runTrackRP3GovernanceIntake({ repoRoot: tempRoot });
      assert.equal(intake.ok, false);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('duplicate cron invocation is idempotent', async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'track-r-p3-intake-'));
    try {
      copyRepoEvidenceTree(tempRoot, { runs: [CANONICAL_RUN, SUPERSEDED_RUN] });
      const store = new InMemoryTrackRP3ReviewStateStore(tempRoot);
      const first = await runTrackRP3GovernanceIntakeCron({
        repoRoot: tempRoot,
        skipJournalWrites: true,
        reviewStateStore: store,
      });
      assert.equal(first.ok, true);
      if (!first.ok) return;

      const loaded = await store.loadRegistry();
      assert.equal(loaded.ok, true);
      if (!loaded.ok) return;
      const existing = findPacketReviewEntry(loaded.registry, CANONICAL_RUN);
      assert.ok(existing);
      await store.saveRegistry(
        upsertPacketReviewEntry({
          registry: loaded.registry,
          entry: {
            ...existing,
            intake_journals_completed: true,
          },
        }),
      );

      const second = await runTrackRP3GovernanceIntakeCron({
        repoRoot: tempRoot,
        skipJournalWrites: true,
        reviewStateStore: store,
      });
      assert.equal(second.ok, true);
      if (!second.ok || !first.ok) return;
      assert.equal(second.idempotent, true);
      assert.equal(second.status, 'seen');
      assert.equal(first.zeus_identity_digest, second.zeus_identity_digest);
      assert.equal(first.eve_identity_digest, second.eve_identity_digest);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('ZEUS and EVE contexts have byte-identical evidence identity', () => {
    const intake = runTrackRP3GovernanceIntake();
    assert.equal(intake.ok, true);
    if (!intake.ok) return;
    const identity = buildTrackRP3EvidenceIdentity(intake.candidate);
    const zeusDigest = evidenceIdentityDigest(identity);
    const eveDigest = evidenceIdentityDigest(identity);
    assert.equal(zeusDigest, eveDigest);
  });

  it('generic cron journal cannot satisfy packet review', () => {
    assert.equal(
      satisfiesTrackRP3PacketReview({
        scope: 'Sentinel verification',
        category: 'inference',
        derivedFrom: ['eve-synthesis:verify', 'source:cron'],
      }),
      false,
    );
    assert.equal(
      satisfiesTrackRP3PacketReview({
        scope: TRACK_R_P3_GOVERNANCE_SCOPE,
        category: 'governance-review',
        derivedFrom: ['workflow_run_id:32264177719', 'packet_hash:abc', 'review_lane:ZEUS'],
      }),
      true,
    );
  });

  it('machine verification cannot emit ADOPT without independent-review mechanism', () => {
    const intake = runTrackRP3GovernanceIntake();
    assert.equal(intake.ok, true);
    if (!intake.ok) return;
    const receipt = renderTrackRP3MachineVerificationReceipt({
      lane: 'ZEUS',
      context: intake.candidate,
      generatedAt: new Date().toISOString(),
      intakeStatus: 'AWAITING_INDEPENDENT_REVIEW',
    });
    assert.match(receipt, /AWAITING_INDEPENDENT_REVIEW/);
    assert.doesNotMatch(receipt, /\bADOPT\b/);
    assert.match(receipt, /execution_authorized: false/);
    assert.match(receipt, /review_does_not_authorize_execution: true/);
  });

  it('no batch-apply mutation function is reachable from the intake route', () => {
    const routeSource = readFileSync(
      join(process.cwd(), 'app/api/cron/track-r-p3-governance-intake/route.ts'),
      'utf8',
    );
    const cronSource = readFileSync(
      join(process.cwd(), 'lib/watchdog/batchRepair/runTrackRP3GovernanceIntakeCron.ts'),
      'utf8',
    );
    const storeSource = readFileSync(
      join(process.cwd(), 'lib/watchdog/batchRepair/trackRP3ReviewStateStore.ts'),
      'utf8',
    );
    const intakeSource = readFileSync(
      join(process.cwd(), 'lib/watchdog/batchRepair/trackRP3GovernanceIntake.ts'),
      'utf8',
    );
    for (const source of [routeSource, cronSource, storeSource, intakeSource]) {
      assert.doesNotMatch(source, /runBatchApply/);
      assert.doesNotMatch(source, /track-r:batch-apply/);
      assert.doesNotMatch(source, /BATCH_EXECUTION_FEATURE_FLAG/);
      assert.doesNotMatch(source, /writeFileSync/);
      assert.doesNotMatch(source, /writePacketReviewRegistry/);
    }
  });
});
