// C-404: Track R apply-path CAS recheck + commitGuard preflight wiring
// Run: tsx tests/contract/trackRBatchApplyPreflight.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import {
  assertBatchCommitAllowedAtApply,
  loadApprovedCaptureManifest,
  runBatchApplyPreflight,
  verifyFreshLineageSnapshotAtApply,
} from '@/lib/watchdog/batchRepair/runBatchApplyPreflight';
import { CAPTURE_0123Z_EXPECTED_HASHES } from '@/lib/watchdog/batchRepair/verifyTrackRCaptureAttestation';
import { verifyManifestHash } from '@/lib/watchdog/batchRepair/semanticManifest';
import { loadWitnessFromFile } from '@/lib/watchdog/batchRepair/witnessResolution';
import { COMMIT_GUARD_BASE, loadFixtures } from './trackRBatchApplyPreflightFixtures';

describe('Track R batch apply preflight (apply-path CAS)', () => {
  it('loads capture-aligned manifest with approved verdicts', () => {
    const manifest = loadApprovedCaptureManifest();
    assert.equal(verifyManifestHash(manifest), true);
    assert.equal(manifest.manifest_hash, CAPTURE_0123Z_EXPECTED_HASHES.semantic_manifest_hash);
    assert.equal(manifest.zeus_verdict, 'approved');
    assert.equal(manifest.human_approval, 'approved');
    assert.equal(manifest.production_execution_enabled, false);
  });

  it('assertBatchCommitAllowedAtApply rejects when apply CAS does not match', () => {
    const { manifest } = loadFixtures();
    const guard = assertBatchCommitAllowedAtApply({
      applyCas: {
        capture_id: 'track-r-c403-2026-08-15T0123Z',
        verified_at: '2026-08-15T15:00:00.000Z',
        attested_lineage_snapshot_hash: CAPTURE_0123Z_EXPECTED_HASHES.lineage_snapshot_hash,
        fresh_lineage_snapshot_hash: 'deadbeef',
        fresh_cas_match: false,
        fresh_lineage_snapshot_hash_matches: false,
        checks: [],
      },
      guardInput: {
        ...COMMIT_GUARD_BASE,
        manifest,
        approved_manifest_hash: manifest.manifest_hash,
      },
    });
    assert.equal(guard.ok, false);
    assert.match(guard.errors.join(' '), /apply-time lineage snapshot hash does not match/i);
  });

  it('assertBatchCommitAllowedAtApply wires production CAS into commitGuard', () => {
    const manifest = loadApprovedCaptureManifest();
    const guard = assertBatchCommitAllowedAtApply({
      applyCas: {
        capture_id: 'track-r-c403-2026-08-15T0123Z',
        verified_at: '2026-08-15T15:00:00.000Z',
        attested_lineage_snapshot_hash: CAPTURE_0123Z_EXPECTED_HASHES.lineage_snapshot_hash,
        fresh_lineage_snapshot_hash: CAPTURE_0123Z_EXPECTED_HASHES.lineage_snapshot_hash,
        fresh_cas_match: true,
        fresh_lineage_snapshot_hash_matches: true,
        checks: [],
      },
      guardInput: {
        ...COMMIT_GUARD_BASE,
        manifest,
        approved_manifest_hash: manifest.manifest_hash,
        live_seal_witness_export: null,
      },
    });
    assert.equal(guard.ok, false);
    assert.ok(
      guard.errors.some((error) => error.includes('authenticated live seal witness export required')),
    );
  });

  it('runBatchApplyPreflight fails closed without production KV credentials', async () => {
    const result = await runBatchApplyPreflight({
      verifiedAt: '2026-08-15T15:00:00.000Z',
    });
    assert.equal(result.execution_authorized, false);
    assert.equal(result.production_mutation_performed, false);
    assert.equal(result.preflight_status, 'apply_credentials_required');
    assert.equal(result.fresh_lineage_snapshot_hash_matches, false);
    assert.ok(result.checks.some((row) => row.check === 'apply_cas_probe' && row.result === 'fail'));
  });

  it('verifyFreshLineageSnapshotAtApply labels checks with apply prefix', async () => {
    const result = await verifyFreshLineageSnapshotAtApply({
      verifiedAt: '2026-08-15T15:00:00.000Z',
    });
    assert.ok(result.checks.some((row) => row.check.startsWith('apply_')));
  });
});
