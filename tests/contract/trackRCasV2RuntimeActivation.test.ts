// C-405: CAS-v2 runtime activation — binding, CAS gate, commit guard wiring
// Run: tsx tests/contract/trackRCasV2RuntimeActivation.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CAPTURE_2014Z_EXPECTED_HASHES,
  CAPTURE_2014Z_ID,
  resolveTrackRCaptureBinding,
  TRACK_R_DEFAULT_CAPTURE_ID,
  TRACK_R_V2_LINEAGE_SNAPSHOT_VERSION,
} from '@/lib/watchdog/batchRepair/trackRCaptureBinding';
import { assertBatchCommitAllowed } from '@/lib/watchdog/batchRepair/commitGuard';
import { loadApprovedCaptureManifest } from '@/lib/watchdog/batchRepair/runBatchApplyPreflight';
import { COMMIT_GUARD_BASE } from './trackRBatchApplyPreflightFixtures';
import {
  validateV2GovernanceCandidateBinding,
  verifyTrackRExecutionReadiness,
} from '@/lib/watchdog/batchRepair/verifyTrackRExecutionReadiness';

describe('CAS-v2 runtime activation — capture binding', () => {
  it('defaults to Capture #9 v2 governance candidate', () => {
    const binding = resolveTrackRCaptureBinding();
    assert.equal(TRACK_R_DEFAULT_CAPTURE_ID, CAPTURE_2014Z_ID);
    assert.equal(binding.capture_id, CAPTURE_2014Z_ID);
    assert.equal(binding.lineage_snapshot_version, TRACK_R_V2_LINEAGE_SNAPSHOT_VERSION);
    assert.equal(
      binding.attestation_hashes.lineage_snapshot_hash,
      CAPTURE_2014Z_EXPECTED_HASHES.lineage_snapshot_hash,
    );
    assert.equal(
      binding.attestation_hashes.execution_witness_hash,
      CAPTURE_2014Z_EXPECTED_HASHES.execution_witness_hash,
    );
  });

  it('resolves Capture #9 from provenance-only archive', () => {
    const binding = resolveTrackRCaptureBinding({ captureId: CAPTURE_2014Z_ID });
    assert.ok(binding.archive_path.endsWith('capture-2014Z'));
    assert.equal(binding.lineage_snapshot_version, 'v2');
    const validation = validateV2GovernanceCandidateBinding({ binding });
    assert.equal(validation.ok, true);
    assert.equal(validation.awaitingFreshAttestation, true);
  });

  it('still resolves historical Capture #5 as v1 when requested explicitly', () => {
    const binding = resolveTrackRCaptureBinding({
      captureId: 'track-r-c403-2026-08-15T0123Z',
    });
    assert.equal(binding.lineage_snapshot_version, 'v1');
    assert.equal(
      binding.attestation_hashes.lineage_snapshot_hash,
      '3db4832725df8d3d49942e60dc9ddd00d436fdb741329362b6eb4d6753669af5',
    );
  });
});

describe('CAS-v2 runtime activation — readiness posture', () => {
  it('returns awaiting_human_consent for default v2 binding without live CAS probe', async () => {
    const result = await verifyTrackRExecutionReadiness({
      probeFreshCas: false,
    });

    assert.equal(result.capture_id, CAPTURE_2014Z_ID);
    assert.equal(result.lineage_snapshot_version, 'v2');
    assert.equal(result.readiness_status, 'awaiting_human_consent');
    assert.equal(result.execution_authorized, false);
    assert.ok(
      result.checks.some(
        (row) => row.check === 'v2_governance_candidate_hashes' && row.result === 'pass',
      ),
    );
  });

  it('blocks superseded Capture #7 v1 authorization path', async () => {
    const result = await verifyTrackRExecutionReadiness({
      captureId: 'track-r-c403-2026-08-15T1919Z',
      probeFreshCas: false,
    });

    assert.equal(result.readiness_status, 'blocked');
    assert.ok(
      result.checks.some(
        (row) => row.check === 'lineage_snapshot_version_execution' && row.result === 'fail',
      ),
    );
  });
});

describe('CAS-v2 runtime activation — commit guard version binding', () => {
  it('rejects commit guard when v2 version/hash binding is missing', () => {
    const manifest = loadApprovedCaptureManifest();
    const guard = assertBatchCommitAllowed({
      ...COMMIT_GUARD_BASE,
      manifest,
      approved_manifest_hash: manifest.manifest_hash,
      fresh_lineage_snapshot_hash_matches: true,
      preflight_read_only: true,
      live_seal_witness_export: null,
    });

    assert.equal(guard.ok, false);
    assert.ok(guard.errors.some((error) => error.includes('version missing')));
  });

  it('accepts matched v2 version/hash binding alongside CAS match flag', () => {
    const manifest = loadApprovedCaptureManifest();
    const hash = CAPTURE_2014Z_EXPECTED_HASHES.lineage_snapshot_hash;
    const guard = assertBatchCommitAllowed({
      ...COMMIT_GUARD_BASE,
      manifest,
      approved_manifest_hash: manifest.manifest_hash,
      fresh_lineage_snapshot_hash_matches: true,
      lineage_snapshot_version: 'v2',
      attested_lineage_snapshot_hash: hash,
      fresh_lineage_snapshot_hash: hash,
      preflight_read_only: true,
      live_seal_witness_export: null,
    });

    assert.equal(guard.ok, false);
    assert.ok(!guard.errors.some((error) => error.includes('version missing')));
    assert.ok(!guard.errors.some((error) => error.includes('unsupported lineage snapshot version')));
  });
});
