// C-404: Track R apply-path CAS recheck + commitGuard preflight wiring
// Run: tsx tests/contract/trackRBatchApplyPreflight.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertBatchCommitAllowedAtApply,
  classifyApplyCasProbeOutcome,
  loadApprovedCaptureManifest,
  runBatchApplyPreflight,
  verifyFreshLineageSnapshotAtApply,
} from '@/lib/watchdog/batchRepair/runBatchApplyPreflight';
import { CAPTURE_0123Z_EXPECTED_HASHES } from '@/lib/watchdog/batchRepair/verifyTrackRCaptureAttestation';
import { verifyManifestHash } from '@/lib/watchdog/batchRepair/semanticManifest';
import { assertBatchCommitAllowed } from '@/lib/watchdog/batchRepair/commitGuard';
import { hasUpstashKvCredentials } from '@/lib/kv/upstashEnv';
import { COMMIT_GUARD_BASE, loadFixtures } from './trackRBatchApplyPreflightFixtures';

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
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
  }
}

describe('Track R batch apply preflight (apply-path CAS)', () => {
  it('loads capture-aligned manifest with approved verdicts', () => {
    const manifest = loadApprovedCaptureManifest();
    assert.equal(verifyManifestHash(manifest), true);
    assert.equal(manifest.manifest_hash, CAPTURE_0123Z_EXPECTED_HASHES.semantic_manifest_hash);
    assert.equal(manifest.zeus_verdict, 'approved');
    assert.equal(manifest.human_approval, 'approved');
    assert.equal(manifest.production_execution_enabled, false);
  });

  it('classifyApplyCasProbeOutcome distinguishes credentials, drift, and incomplete probes', () => {
    assert.equal(
      classifyApplyCasProbeOutcome({
        capture_id: 'track-r-c403-2026-08-15T0123Z',
        verified_at: '2026-08-15T15:00:00.000Z',
        attested_lineage_snapshot_hash: CAPTURE_0123Z_EXPECTED_HASHES.lineage_snapshot_hash,
        fresh_lineage_snapshot_hash: null,
        fresh_cas_match: null,
        fresh_lineage_snapshot_hash_matches: false,
        observed_integrity_gate_active: null,
        fresh_lineage_snapshot_hash_v2: null,
        checks: [
          {
            check: 'apply_cas_probe',
            result: 'fail',
            detail: 'production KV credentials required for lineage CAS probe',
          },
        ],
      }).status,
      hasUpstashKvCredentials() ? 'probe_incomplete' : 'credentials_required',
    );

    assert.equal(
      classifyApplyCasProbeOutcome({
        capture_id: 'track-r-c403-2026-08-15T0123Z',
        verified_at: '2026-08-15T15:00:00.000Z',
        attested_lineage_snapshot_hash: CAPTURE_0123Z_EXPECTED_HASHES.lineage_snapshot_hash,
        fresh_lineage_snapshot_hash: 'deadbeef',
        fresh_cas_match: false,
        fresh_lineage_snapshot_hash_matches: false,
        observed_integrity_gate_active: true,
        fresh_lineage_snapshot_hash_v2: null,
        checks: [],
      }).status,
      'cas_drift',
    );

    assert.equal(
      classifyApplyCasProbeOutcome({
        capture_id: 'track-r-c403-2026-08-15T0123Z',
        verified_at: '2026-08-15T15:00:00.000Z',
        attested_lineage_snapshot_hash: CAPTURE_0123Z_EXPECTED_HASHES.lineage_snapshot_hash,
        fresh_lineage_snapshot_hash: null,
        fresh_cas_match: null,
        fresh_lineage_snapshot_hash_matches: false,
        observed_integrity_gate_active: null,
        fresh_lineage_snapshot_hash_v2: null,
        checks: [
          {
            check: 'apply_cas_public_api',
            result: 'fail',
            detail: 'vault/status=503 seal-status=503',
          },
        ],
      }).status,
      'probe_incomplete',
    );
  });

  it('assertBatchCommitAllowedAtApply rejects forged CAS objects by re-probing production', async () => {
    const { manifest } = loadFixtures();
    const guard = await assertBatchCommitAllowedAtApply({
      guardInput: {
        ...COMMIT_GUARD_BASE,
        manifest,
        approved_manifest_hash: manifest.manifest_hash,
        live_seal_witness_export: null,
      },
      verifiedAt: '2026-08-15T15:00:00.000Z',
    });
    assert.equal(guard.ok, false);
    assert.ok(guard.applyCas.checks.length > 0);
    assert.ok(guard.errors.length > 0);
  });

  it('runBatchApplyPreflight fails closed without production KV credentials', async () => {
    await withKvCredentialsCleared(async () => {
      const result = await runBatchApplyPreflight({
        verifiedAt: '2026-08-15T15:00:00.000Z',
      });
      assert.equal(result.execution_authorized, false);
      assert.equal(result.production_mutation_performed, false);
      assert.equal(result.preflight_status, 'apply_credentials_required');
      assert.equal(result.fresh_lineage_snapshot_hash_matches, false);
      assert.ok(result.checks.some((row) => row.check === 'apply_cas_probe' && row.result === 'fail'));
    });
  });

  it('preflight_read_only skips execution flag and commit-only prerequisites', () => {
    const manifest = loadApprovedCaptureManifest();
    const guard = assertBatchCommitAllowed({
      ...COMMIT_GUARD_BASE,
      manifest,
      approved_manifest_hash: manifest.manifest_hash,
      execution_feature_flag_enabled: false,
      mutation_journal_available: false,
      rollback_plan_verified: false,
      preflight_read_only: true,
      fresh_lineage_snapshot_hash_matches: true,
      live_seal_witness_export: null,
    });
    assert.equal(guard.ok, false);
    assert.ok(!guard.errors.some((error) => error.includes('TRACK_R_BATCH_EXECUTION_ENABLED')));
    assert.ok(!guard.errors.some((error) => error.includes('mutation journal')));
    assert.ok(!guard.errors.some((error) => error.includes('rollback plan')));
  });

  it('verifyFreshLineageSnapshotAtApply labels checks with apply prefix', async () => {
    const result = await verifyFreshLineageSnapshotAtApply({
      verifiedAt: '2026-08-15T15:00:00.000Z',
    });
    assert.ok(result.checks.some((row) => row.check.startsWith('apply_')));
    assert.equal(result.observed_integrity_gate_active, null);
  });
});
