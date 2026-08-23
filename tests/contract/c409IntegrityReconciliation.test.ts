// C-409: Integrity reconciliation + Track R intake observability
// Run: tsx tests/contract/c409IntegrityReconciliation.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildIntegrityAuthorityBlock,
  resolveIntegrityDegraded,
} from '@/lib/integrity/integrityAuthority';
import {
  listZeusVerificationReportFilenames,
  loadLatestZeusVerificationReport,
  mapZeusVerificationStatus,
} from '@/lib/integrity/zeusCatalog';
import { deriveQuorumAuthoritySemantics } from '@/lib/mic/quorumSemantics';
import type { SentinelQuorumState } from '@/lib/mic/quorumTracker';
import {
  buildTrackRP3IntakeObservability,
  getLatestIssuedPacketRunIdFromRepo,
} from '@/lib/trackR/p3IntakeObservability';
import {
  loadIssuedPacketRegistry,
  selectLatestIssuedPacketEntry,
} from '@/lib/watchdog/batchRepair/p3IssuedPacketRegistry';
import {
  intakeStateIsNotVerdict,
  validateTrackRIndependentReviewRecord,
} from '@/lib/watchdog/batchRepair/trackRP3ReviewArtifacts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function latestIssuedRun(): { runId: string; packetHash: string; journalId: string; productionCommit: string } {
  const loaded = loadIssuedPacketRegistry(repoRoot);
  assert.equal(loaded.ok, true);
  if (!loaded.ok) throw new Error('issued registry unavailable');
  const latest = selectLatestIssuedPacketEntry(loaded.registry);
  assert.ok(latest, 'latest issued packet missing');
  return {
    runId: latest!.workflow_run_id,
    packetHash: latest!.packet_hash,
    journalId: latest!.journal_id,
    productionCommit: latest!.observed_production_commit,
  };
}

function readRepoFile(rel: string): string {
  return readFileSync(join(repoRoot, rel), 'utf8');
}

function baseQuorum(overrides: Partial<SentinelQuorumState> = {}): SentinelQuorumState {
  return {
    schema: 'SENTINEL_QUORUM_V1',
    cycle: 'C-409',
    required: ['ATLAS', 'ZEUS', 'EVE', 'JADE', 'AUREA'],
    entries: {},
    attestations_received: 5,
    attestations_needed: 5,
    status: 'achieved',
    initiated_at: '2026-08-20T00:00:00.000Z',
    completed_at: '2026-08-20T00:00:00.000Z',
    updatedAt: '2026-08-20T00:00:00.000Z',
    ...overrides,
  };
}

describe('C-409 integrity authority reconciliation', () => {
  it('snapshot-lite preserves upstream degraded via shared resolver', () => {
    const src = readRepoFile('app/api/terminal/snapshot-lite/route.ts');
    assert.match(src, /resolveIntegrityDegraded\(/);
    assert.match(src, /authority,/);
    assert.match(src, /zeus_verification/);
  });

  it('green GI plus degraded authority remains degraded', () => {
    const degraded = resolveIntegrityDegraded({
      giDegraded: false,
      kvOk: true,
      integrityLaneOk: true,
      mode: 'green',
      tripwireElevated: false,
      gicAvailable: true,
      zeusVerificationStatus: 'disputed',
    });
    assert.equal(degraded, true);
  });

  it('unknown ZEUS verification authority remains degraded fail-closed', () => {
    const degraded = resolveIntegrityDegraded({
      giDegraded: false,
      kvOk: true,
      integrityLaneOk: true,
      mode: 'green',
      tripwireElevated: false,
      gicAvailable: true,
      zeusVerificationStatus: 'unknown',
    });
    assert.equal(degraded, true);
  });

  it('integrity-status caches authority-degraded GIC results', () => {
    const src = readRepoFile('app/api/integrity-status/route.ts');
    assert.match(src, /skipCache: true/);
    assert.doesNotMatch(src, /if \(!result\.degraded\)/);
  });

  it('latest ZEUS report wins chronologically by filename sort', () => {
    const files = listZeusVerificationReportFilenames(repoRoot);
    assert.ok(files.length > 0);
    const latest = loadLatestZeusVerificationReport(repoRoot);
    assert.ok(latest);
    assert.equal(latest!.relative_path.endsWith(files[0]), true);
    assert.ok(typeof latest!.report.verification_status === 'string');
    assert.ok(latest!.report.verification_status!.length > 0);
  });

  it('mapZeusVerificationStatus applies documented normalization rules', () => {
    assert.equal(mapZeusVerificationStatus('confirmed'), 'verified');
    assert.equal(mapZeusVerificationStatus('verified'), 'verified');
    assert.equal(mapZeusVerificationStatus('disputed'), 'disputed');
    assert.equal(mapZeusVerificationStatus('blocked'), 'blocked');
    assert.equal(mapZeusVerificationStatus(undefined), 'unknown');
    assert.equal(mapZeusVerificationStatus('unexpected-value'), 'unknown');
  });

  it('latest ZEUS catalog report maps through normalization rules', () => {
    const latest = loadLatestZeusVerificationReport(repoRoot);
    assert.ok(latest);
    const raw = latest!.report.verification_status;
    const mapped = mapZeusVerificationStatus(raw);
    switch (raw) {
      case 'confirmed':
      case 'verified':
        assert.equal(mapped, 'verified');
        break;
      case 'disputed':
        assert.equal(mapped, 'disputed');
        break;
      case 'blocked':
        assert.equal(mapped, 'blocked');
        break;
      default:
        assert.equal(mapped, 'unknown');
        break;
    }
  });

  it('quorum receipt does not imply agreement or execution authority', () => {
    const semantics = deriveQuorumAuthoritySemantics(baseQuorum(), {
      verification_status: 'disputed',
      candidates_reviewed: 0,
      tripwire_active: true,
    });
    assert.equal(semantics.attestation_agreement, null);
    assert.equal(semantics.execution_authorized, false);
    assert.equal(semantics.seal_status, 'receipt_quorum_only');
    assert.match(semantics.receipt_note, /not seal completion/);
  });

  it('authority block exposes degraded and gic availability separately', () => {
    const authority = buildIntegrityAuthorityBlock({
      persistenceSource: 'kv',
      kvBacked: true,
      renderUsed: false,
      gicAvailable: false,
      zeusVerificationStatus: 'disputed',
      degraded: true,
    });
    assert.equal(authority.degraded, true);
    assert.equal(authority.gic_available, false);
    assert.equal(authority.zeus_verification_status, 'disputed');
  });
});

describe('C-409 Track R intake observability', () => {
  it('intake visibility is read-only and never authorizes execution', async () => {
    const latest = latestIssuedRun();
    const status = await buildTrackRP3IntakeObservability({
      workflowRunId: latest.runId,
      repoRoot,
    });
    assert.equal(status.read_only, true);
    assert.equal(status.execution_authorized, false);
    assert.equal(status.run_id, latest.runId);
    assert.equal(status.packet_hash, latest.packetHash);
    assert.equal(status.issued_registry_source, 'committed');
    assert.equal(status.intake_state, 'AWAITING_INDEPENDENT_REVIEW');
    assert.equal(status.structurally_accepted, false);
    assert.equal(status.ok, true);
  });

  it('defaults to latest issued packet when run_id is omitted', async () => {
    const latest = latestIssuedRun();
    const status = await buildTrackRP3IntakeObservability({ repoRoot });
    assert.equal(status.run_id, latest.runId);
    assert.equal(status.packet_hash, latest.packetHash);
    assert.equal(getLatestIssuedPacketRunIdFromRepo(repoRoot), latest.runId);
  });

  it('intake receipt state cannot become ADOPT verdict', () => {
    assert.equal(intakeStateIsNotVerdict('INTAKE_VERIFIED'), true);
    assert.equal(intakeStateIsNotVerdict('ADOPT'), false);
  });

  it('ZEUS and EVE review records require exact packet binding', () => {
    const latest = latestIssuedRun();
    const expected = {
      workflow_run_id: latest.runId,
      packet_hash: latest.packetHash,
      journal_id: latest.journalId,
      production_commit: latest.productionCommit,
    };
    const ok = validateTrackRIndependentReviewRecord(
      {
        reviewer: 'ZEUS',
        workflow_run_id: expected.workflow_run_id,
        packet_hash: expected.packet_hash,
        journal_id: expected.journal_id,
        production_commit: expected.production_commit,
        capture_id: 'capture-2014Z',
        verdict: 'ADOPT',
        reviewed_at: '2026-08-20T12:00:00.000Z',
        evidence_refs: [`docs/epicon/cycles/C-407/p3-preparation/runs/${latest.runId}/operator-packet.json`],
      },
      expected,
    );
    assert.equal(ok.ok, true);

    const bad = validateTrackRIndependentReviewRecord(
      {
        reviewer: 'EVE',
        workflow_run_id: expected.workflow_run_id,
        packet_hash: 'deadbeef',
        journal_id: expected.journal_id,
        production_commit: expected.production_commit,
        capture_id: 'capture-2014Z',
        verdict: 'CHALLENGE',
        reviewed_at: '2026-08-20T12:00:00.000Z',
        evidence_refs: [`docs/epicon/cycles/C-407/p3-preparation/runs/${latest.runId}/operator-packet.json`],
      },
      expected,
    );
    assert.equal(bad.ok, false);
    if (!bad.ok) {
      assert.ok(bad.errors.includes('packet_hash_binding_failed'));
    }
  });

  it('superseded run cannot satisfy current-run gates', async () => {
    const latest = latestIssuedRun();
    const status = await buildTrackRP3IntakeObservability({
      workflowRunId: '32264177719',
      repoRoot,
    });
    assert.equal(status.intake_state, 'SUPERSEDED');
    assert.equal(status.structurally_accepted, false);
    assert.equal(status.ok, true);
    assert.equal(status.superseded_by_run_id, latest.runId);
    assert.ok(status.blocked_reasons.some((reason) => reason.includes('superseded')));
    assert.equal(status.execution_authorized, false);
  });

  it('unknown and current runs do not invent superseded_by_run_id', async () => {
    const latest = latestIssuedRun();
    const current = await buildTrackRP3IntakeObservability({
      workflowRunId: latest.runId,
      repoRoot,
    });
    assert.equal(current.superseded_by_run_id, null);

    const unknown = await buildTrackRP3IntakeObservability({
      workflowRunId: '99999999999',
      repoRoot,
    });
    assert.equal(unknown.intake_state, 'NOT_SEEN');
    assert.equal(unknown.superseded_by_run_id, null);
  });

  it('missing human consent keeps execution_authorized false', async () => {
    const latest = latestIssuedRun();
    const status = await buildTrackRP3IntakeObservability({
      workflowRunId: latest.runId,
      repoRoot,
    });
    assert.equal(status.execution_authorized, false);
    assert.ok(status.blocked_reasons.includes('human_consent_absent'));
    assert.ok(status.blocked_reasons.includes('execution_handoff_absent'));
  });

  it('intake route is read-only facade', () => {
    const src = readRepoFile('app/api/track-r/p3-intake-status/route.ts');
    assert.match(src, /buildTrackRP3IntakeObservability/);
    assert.doesNotMatch(src, /batch-apply/);
    assert.doesNotMatch(src, /execution_authorized:\s*true/);
  });

  it('fixtures avoid production mutation paths in changed routes', () => {
    const intake = readRepoFile('app/api/track-r/p3-intake-status/route.ts');
    assert.doesNotMatch(intake, /batchApply/);
    assert.doesNotMatch(intake, /track-r:batch-apply/);
  });
});
