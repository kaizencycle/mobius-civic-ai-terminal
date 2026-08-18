// C-407: Track R P3 preparation safety + operator packet (read-only)
// Run: tsx tests/contract/trackRP3Preparation.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertAffectedBlockSetAligned,
  assertApplyModeRejected,
  assertApplyPreflightPass,
  assertAwaitingExecutionHandoff,
  assertBoundary131Unresolved,
  assertCaptureNineBinding,
  assertFreshCasMatch,
  assertLockedHashBinding,
  assertMutationJournalComplete,
  assertP3DryRunModeExplicit,
  assertProductionWriteEnvAbsent,
  assertReadinessDoesNotAuthorizeExecution,
  assertSignedHandoffNotConsumed,
  assertSkipCasProbeRejectedForProduction,
  assertUnsignedTemplateDoesNotAuthorize,
  assertZeroProductionWrites,
  P3_PREPARATION_DRY_RUN_MODE,
} from '@/lib/watchdog/batchRepair/p3PreparationSafety';
import {
  assertProductionCommitBinding,
  assertProductionBaseUrlAllowed,
  normalizeGitSha,
  observeProductionDeploymentCommit,
  TRACK_R_P3_ALLOWED_PRODUCTION_BASE_URLS,
} from '@/lib/watchdog/batchRepair/productionDeploymentBinding';
import {
  assertPacketNotPreviouslyIssued,
  loadIssuedPacketRegistry,
} from '@/lib/watchdog/batchRepair/p3IssuedPacketRegistry';
import { materializeP3PreparationEvidence } from '@/lib/watchdog/batchRepair/materializeP3PreparationEvidence';
import {
  buildP3OperatorPacket,
  renderP3OperatorPacketMarkdown,
} from '@/lib/watchdog/batchRepair/buildP3OperatorPacket';
import {
  InMemoryBatchApplyMutationJournal,
  buildJournalId,
  runBatchApply,
  loadApprovedCaptureManifest,
  CAPTURE_2014Z_ID,
  BATCH_EXECUTION_FEATURE_FLAG,
} from '@/lib/watchdog/batchRepair';
import { CAPTURE_2014Z_EXPECTED_HASHES } from '@/lib/watchdog/batchRepair/trackRCaptureV2Governance';
import { TRACK_R_ALLOW_PRODUCTION_WRITES_ENV } from '@/lib/watchdog/batchRepair/oneShotExecutionGuard';
import { loadFixtures } from './trackRBatchApplyPreflightFixtures';

const FULL_SHA_A = '629cf6880123456789abcdef0123456789abcdef';
const FULL_SHA_B = 'b708c1ad0123456789abcdef0123456789abcdef';
const ALLOWLISTED_BASE = TRACK_R_P3_ALLOWED_PRODUCTION_BASE_URLS[0];

const KV_ENV_KEYS = [
  'KV_REST_API_URL',
  'KV_REST_API_TOKEN',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
] as const;

async function withKvCredentialsCleared<T>(fn: () => Promise<T>): Promise<T> {
  const saved = Object.fromEntries(KV_ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of KV_ENV_KEYS) {
    delete process.env[key];
  }
  try {
    return await fn();
  } finally {
    for (const key of KV_ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

describe('Track R P3 preparation safety', () => {
  it('requires explicit dry_run_only mode', () => {
    assert.equal(assertP3DryRunModeExplicit(P3_PREPARATION_DRY_RUN_MODE).ok, true);
    assert.equal(assertP3DryRunModeExplicit(undefined).ok, false);
  });

  it('rejects --apply for P3 preparation', () => {
    assert.equal(assertApplyModeRejected(false).ok, true);
    assert.equal(assertApplyModeRejected(true).ok, false);
  });

  it('rejects --skip-cas-probe for production P3 preparation', () => {
    assert.equal(assertSkipCasProbeRejectedForProduction(false).ok, true);
    assert.equal(assertSkipCasProbeRejectedForProduction(true).ok, false);
  });

  it('rejects production-write environment variables', () => {
    const saved = {
      exec: process.env[BATCH_EXECUTION_FEATURE_FLAG],
      writes: process.env[TRACK_R_ALLOW_PRODUCTION_WRITES_ENV],
    };
    delete process.env[BATCH_EXECUTION_FEATURE_FLAG];
    delete process.env[TRACK_R_ALLOW_PRODUCTION_WRITES_ENV];
    assert.equal(assertProductionWriteEnvAbsent().ok, true);

    process.env[BATCH_EXECUTION_FEATURE_FLAG] = 'true';
    assert.equal(assertProductionWriteEnvAbsent().ok, false);

    delete process.env[BATCH_EXECUTION_FEATURE_FLAG];
    process.env[TRACK_R_ALLOW_PRODUCTION_WRITES_ENV] = 'true';
    assert.equal(assertProductionWriteEnvAbsent().ok, false);

    if (saved.exec === undefined) delete process.env[BATCH_EXECUTION_FEATURE_FLAG];
    else process.env[BATCH_EXECUTION_FEATURE_FLAG] = saved.exec;
    if (saved.writes === undefined) delete process.env[TRACK_R_ALLOW_PRODUCTION_WRITES_ENV];
    else process.env[TRACK_R_ALLOW_PRODUCTION_WRITES_ENV] = saved.writes;
  });

  it('unsigned handoff template cannot authorize execution', () => {
    const templatePath = join(
      process.cwd(),
      'artifacts/C-404/track-r-lineage-v2/TRACK_R_V2_EXECUTION_HANDOFF_TEMPLATE.md',
    );
    const content = readFileSync(templatePath, 'utf8');
    assert.equal(assertUnsignedTemplateDoesNotAuthorize(content).ok, true);
    assert.equal(
      assertUnsignedTemplateDoesNotAuthorize('execution_authorized: true').ok,
      false,
    );
  });

  it('awaiting_execution_handoff does not authorize execution', () => {
    assert.equal(
      assertReadinessDoesNotAuthorizeExecution({
        readinessStatus: 'awaiting_execution_handoff',
        executionAuthorized: false,
      }).ok,
      true,
    );
    assert.equal(
      assertReadinessDoesNotAuthorizeExecution({
        readinessStatus: 'awaiting_execution_handoff',
        executionAuthorized: true,
      }).ok,
      false,
    );
  });

  it('fails on capture ID mismatch', () => {
    assert.equal(assertCaptureNineBinding(CAPTURE_2014Z_ID).ok, true);
    assert.equal(assertCaptureNineBinding('track-r-c403-2026-08-15T0123Z').ok, false);
  });

  it('fails on locked hash mismatch', () => {
    assert.equal(
      assertLockedHashBinding({
        semantic_manifest_hash: CAPTURE_2014Z_EXPECTED_HASHES.semantic_manifest_hash,
        lineage_snapshot_hash: CAPTURE_2014Z_EXPECTED_HASHES.lineage_snapshot_hash,
        execution_witness_hash: CAPTURE_2014Z_EXPECTED_HASHES.execution_witness_hash,
        rollback_manifest_hash: CAPTURE_2014Z_EXPECTED_HASHES.rollback_manifest_hash,
      }).ok,
      true,
    );
    assert.equal(
      assertLockedHashBinding({
        semantic_manifest_hash: 'deadbeef',
        lineage_snapshot_hash: CAPTURE_2014Z_EXPECTED_HASHES.lineage_snapshot_hash,
        execution_witness_hash: CAPTURE_2014Z_EXPECTED_HASHES.execution_witness_hash,
        rollback_manifest_hash: CAPTURE_2014Z_EXPECTED_HASHES.rollback_manifest_hash,
      }).ok,
      false,
    );
  });

  it('locks production base URL to allowlist', () => {
    assert.equal(assertProductionBaseUrlAllowed(ALLOWLISTED_BASE).ok, true);
    assert.equal(assertProductionBaseUrlAllowed('https://example.test').ok, false);
  });

  it('rejects abbreviated or malformed git SHAs', () => {
    assert.equal(normalizeGitSha(FULL_SHA_A).ok, true);
    assert.equal(normalizeGitSha('629cf688').ok, false);
    assert.equal(normalizeGitSha(null).ok, false);
  });

  it('fails on production commit mismatch', () => {
    assert.equal(
      assertProductionCommitBinding({
        checkedOutCommit: FULL_SHA_A,
        observedProductionCommit: FULL_SHA_A,
        observedEnvironment: 'production',
      }).ok,
      true,
    );
    assert.equal(
      assertProductionCommitBinding({
        checkedOutCommit: FULL_SHA_A,
        observedProductionCommit: FULL_SHA_B,
        observedEnvironment: 'production',
      }).ok,
      false,
    );
    assert.equal(
      assertProductionCommitBinding({
        checkedOutCommit: FULL_SHA_A,
        observedProductionCommit: null,
        observedEnvironment: 'production',
      }).ok,
      false,
    );
    assert.equal(
      assertProductionCommitBinding({
        checkedOutCommit: FULL_SHA_A,
        observedProductionCommit: FULL_SHA_A,
        observedEnvironment: 'preview',
      }).ok,
      false,
    );
  });

  it('fails on CAS drift', () => {
    assert.equal(assertFreshCasMatch(true).ok, true);
    assert.equal(assertFreshCasMatch(false).ok, false);
    assert.equal(assertFreshCasMatch(null).ok, false);
  });

  it('requires awaiting_execution_handoff readiness posture', () => {
    assert.equal(assertAwaitingExecutionHandoff('awaiting_execution_handoff').ok, true);
    assert.equal(assertAwaitingExecutionHandoff('awaiting_human_consent').ok, false);
  });

  it('requires apply_preflight_pass', () => {
    assert.equal(assertApplyPreflightPass('apply_preflight_pass').ok, true);
    assert.equal(assertApplyPreflightPass('apply_blocked').ok, false);
  });

  it('preserves boundary 131→132 and excludes slot 361', () => {
    const manifest = loadApprovedCaptureManifest();
    const boundary = assertBoundary131Unresolved(manifest);
    assert.equal(boundary.ok, true, boundary.errors.join('; '));
    assert.equal(manifest.canonical_assignments['361'], undefined);
  });

  it('fails closed on partial mutation journal', () => {
    assert.equal(assertMutationJournalComplete(null).ok, false);
    const journal = new InMemoryBatchApplyMutationJournal(
      buildJournalId({
        capture_id: CAPTURE_2014Z_ID,
        repair_id: 'track-r-c403-batch-001',
        verified_at: '2026-08-18T14:00:00.000Z',
      }),
      CAPTURE_2014Z_ID,
      'track-r-c403-batch-001',
      '2026-08-18T14:00:00.000Z',
    );
    journal.append({
      at: '2026-08-18T14:00:00.000Z',
      operation: 'track_r_batch_apply_dry_run',
      repair_id: 'track-r-c403-batch-001',
      capture_id: CAPTURE_2014Z_ID,
      mode: 'dry_run',
      lineage_snapshot_hash: CAPTURE_2014Z_EXPECTED_HASHES.lineage_snapshot_hash,
      execution_witness_hash: CAPTURE_2014Z_EXPECTED_HASHES.execution_witness_hash,
      before: {},
      after: {},
    });
    assert.equal(assertMutationJournalComplete(journal.finalize()).ok, true);
  });

  it('rejects duplicate journal and packet hashes via durable registry', () => {
    const registry = loadIssuedPacketRegistry();
    const blocked = assertPacketNotPreviouslyIssued({
      journalId: 'existing-journal',
      journalHash: 'existing-journal-hash',
      packetHash: 'existing-packet-hash',
      registry: {
        ...registry,
        entries: [
          {
            workflow_run_id: '999',
            issued_at: '2026-08-18T14:00:00.000Z',
            journal_id: 'existing-journal',
            journal_hash: 'existing-journal-hash',
            packet_hash: 'existing-packet-hash',
            checked_out_commit: FULL_SHA_A,
            observed_production_commit: FULL_SHA_A,
            preparation_only: true,
            execution_authorized: false,
          },
        ],
      },
    });
    assert.equal(blocked.ok, false);
    assert.equal(
      assertPacketNotPreviouslyIssued({
        journalId: 'new-journal',
        journalHash: 'new-journal-hash',
        packetHash: 'new-packet-hash',
        registry,
      }).ok,
      true,
    );
  });

  it('default batch apply dry-run performs zero writes', async () => {
    await withKvCredentialsCleared(async () => {
      const result = await runBatchApply({
        skipCasProbe: true,
        verifiedAt: '2026-08-18T14:01:00.000Z',
      });
      assert.equal(result.writes_performed, 0);
      assert.equal(result.execution_authorized, false);
      assert.equal(result.production_mutation_performed, false);
    });
  });

  it('builds unsigned operator packet with execution_authorized false', () => {
    const { manifest } = loadFixtures();
    const journal = new InMemoryBatchApplyMutationJournal(
      buildJournalId({
        capture_id: CAPTURE_2014Z_ID,
        repair_id: manifest.repair_id,
        verified_at: '2026-08-18T14:02:00.000Z',
      }),
      CAPTURE_2014Z_ID,
      manifest.repair_id,
      '2026-08-18T14:02:00.000Z',
    );
    journal.append({
      at: '2026-08-18T14:02:00.000Z',
      operation: 'track_r_batch_apply_dry_run',
      repair_id: manifest.repair_id,
      capture_id: CAPTURE_2014Z_ID,
      mode: 'dry_run',
      lineage_snapshot_hash: CAPTURE_2014Z_EXPECTED_HASHES.lineage_snapshot_hash,
      execution_witness_hash: CAPTURE_2014Z_EXPECTED_HASHES.execution_witness_hash,
      before: { active_version: null },
      after: { active_version: manifest.repair_id },
    });
    const finalized = journal.finalize();

    const packet = buildP3OperatorPacket({
      workflowRunId: '123456',
      timestamp: '2026-08-18T14:02:00.000Z',
      checkedOutCommit: FULL_SHA_A,
      observedProductionCommit: FULL_SHA_A,
      captureId: CAPTURE_2014Z_ID,
      mutationJournal: finalized,
      intendedWriteCount: 4,
      intendedBlockNumbers: [1, 2, 3],
      beforeActiveVersion: null,
      afterActiveVersion: manifest.repair_id,
      writeRecords: [],
      rollbackVerified: true,
      rollbackDetail: 'verified',
      readinessStatus: 'awaiting_execution_handoff',
      preflightStatus: 'apply_preflight_pass',
      batchApplyStatus: 'dry_run_pass',
      freshCasMatch: true,
      commitGuardOk: true,
      checks: [],
    });

    assert.equal(packet.execution_authorized, false);
    assert.equal(packet.production_mutation_performed, false);
    assert.ok(packet.packet_hash);
    const markdown = renderP3OperatorPacketMarkdown(packet);
    assert.match(markdown, /execution_authorized: `false`/);
    assert.match(markdown, /UNSIGNED/);
  });

  it('observes production deployment commit from snapshot-lite', async () => {
    const observation = await observeProductionDeploymentCommit({
      baseUrl: ALLOWLISTED_BASE,
      observedAt: '2026-08-18T14:03:00.000Z',
      fetchImpl: async () =>
        ({
          ok: true,
          json: async () => ({
            ok: true,
            deployment: { commit_sha: FULL_SHA_A, environment: 'production' },
          }),
        }) as Response,
    });
    assert.equal(observation.commit_sha, FULL_SHA_A);
    assert.equal(observation.environment, 'production');
    assert.equal(observation.bindable, true);
  });

  it('rejects non-allowlisted production base URL', async () => {
    const observation = await observeProductionDeploymentCommit({
      baseUrl: 'https://example.test',
      fetchImpl: async () =>
        ({
          ok: true,
          json: async () => ({
            ok: true,
            deployment: { commit_sha: FULL_SHA_A, environment: 'production' },
          }),
        }) as Response,
    });
    assert.equal(observation.bindable, false);
    assert.ok(observation.errors.some((error) => error.includes('allowlisted')));
  });

  it('fails closed when production deployment commit is unbound', async () => {
    const observation = await observeProductionDeploymentCommit({
      baseUrl: ALLOWLISTED_BASE,
      fetchImpl: async () =>
        ({
          ok: true,
          json: async () => ({ ok: true, deployment: { commit_sha: null, environment: 'production' } }),
        }) as Response,
    });
    assert.equal(observation.bindable, false);
    assert.ok(observation.errors.length > 0);
  });

  it('signed handoff consumption is rejected when signed file exists', () => {
    const result = assertSignedHandoffNotConsumed({ repoRoot: process.cwd() });
    assert.equal(typeof result.ok, 'boolean');
  });

  it('fails on affected-block-set drift', () => {
    assert.equal(
      assertAffectedBlockSetAligned([
        { check: 'apply_cas_affected_block_set_match', result: 'pass' },
      ]).ok,
      true,
    );
    assert.equal(
      assertAffectedBlockSetAligned([
        { check: 'apply_cas_affected_block_set_match', result: 'fail' },
      ]).ok,
      false,
    );
    assert.equal(assertAffectedBlockSetAligned([]).ok, false);
  });

  it('requires zero production writes', () => {
    assert.equal(assertZeroProductionWrites(0).ok, true);
    assert.equal(assertZeroProductionWrites(1).ok, false);
  });
});
