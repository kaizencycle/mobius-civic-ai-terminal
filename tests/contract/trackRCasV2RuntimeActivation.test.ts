// C-405: CAS-v2 runtime activation — binding, CAS gate, commit guard wiring
// Run: tsx tests/contract/trackRCasV2RuntimeActivation.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

const CAPTURE_2014Z_ARCHIVE = join(
  process.cwd(),
  'artifacts/C-404/track-r-lineage-v2/history/capture-2014Z',
);

function withTempCapture2014ZArchive(mutator: (dir: string) => void): string {
  const dir = mkdtempSync(join(tmpdir(), 'track-r-capture-2014Z-'));
  cpSync(CAPTURE_2014Z_ARCHIVE, dir, { recursive: true });
  mutator(dir);
  return dir;
}

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

  it('resolves Capture #9 from archived package with v2 witness provenance', () => {
    const binding = resolveTrackRCaptureBinding({ captureId: CAPTURE_2014Z_ID });
    assert.ok(binding.archive_path.endsWith('capture-2014Z'));
    assert.equal(binding.lineage_snapshot_version, 'v2');
    const validation = validateV2GovernanceCandidateBinding({ binding });
    assert.equal(validation.ok, true);
    assert.equal(validation.awaitingFreshAttestation, false);
  });

  it('rejects foreign execution_witness_hash_v2 in provenance', () => {
    const dir = withTempCapture2014ZArchive((archivePath) => {
      const captureProvPath = join(archivePath, 'CAPTURE_PROVENANCE.json');
      const captureProv = JSON.parse(readFileSync(captureProvPath, 'utf8')) as Record<
        string,
        unknown
      >;
      captureProv.execution_witness_hash_v2 =
        '0000000000000000000000000000000000000000000000000000000000000001';
      writeFileSync(captureProvPath, `${JSON.stringify(captureProv, null, 2)}\n`);

      const githubProvPath = join(archivePath, 'GITHUB_PROVENANCE.json');
      const githubProv = JSON.parse(readFileSync(githubProvPath, 'utf8')) as Record<
        string,
        unknown
      >;
      githubProv.execution_witness_hash_v2 =
        '0000000000000000000000000000000000000000000000000000000000000001';
      writeFileSync(githubProvPath, `${JSON.stringify(githubProv, null, 2)}\n`);
    });

    try {
      assert.throws(
        () =>
          resolveTrackRCaptureBinding({
            captureId: CAPTURE_2014Z_ID,
            archivePath: dir,
          }),
        /does not match locked Capture #9 governance witness/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects provenance when governance_candidate is false', () => {
    const dir = withTempCapture2014ZArchive((archivePath) => {
      const captureProvPath = join(archivePath, 'CAPTURE_PROVENANCE.json');
      const captureProv = JSON.parse(readFileSync(captureProvPath, 'utf8')) as Record<
        string,
        unknown
      >;
      captureProv.governance_candidate = false;
      writeFileSync(captureProvPath, `${JSON.stringify(captureProv, null, 2)}\n`);
    });

    try {
      assert.throws(
        () =>
          resolveTrackRCaptureBinding({
            captureId: CAPTURE_2014Z_ID,
            archivePath: dir,
          }),
        /not marked governance_candidate/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects provenance capture_id mismatch', () => {
    const dir = withTempCapture2014ZArchive((archivePath) => {
      const captureProvPath = join(archivePath, 'CAPTURE_PROVENANCE.json');
      const captureProv = JSON.parse(readFileSync(captureProvPath, 'utf8')) as Record<
        string,
        unknown
      >;
      captureProv.capture_id = 'track-r-c403-2026-08-15T2012Z';
      writeFileSync(captureProvPath, `${JSON.stringify(captureProv, null, 2)}\n`);
    });

    try {
      assert.throws(
        () =>
          resolveTrackRCaptureBinding({
            captureId: CAPTURE_2014Z_ID,
            archivePath: dir,
          }),
        /CAPTURE_PROVENANCE.json capture_id mismatch/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects conflicting execution_witness_hash_v2 between provenance files', () => {
    const dir = withTempCapture2014ZArchive((archivePath) => {
      const captureProvPath = join(archivePath, 'CAPTURE_PROVENANCE.json');
      const captureProv = JSON.parse(readFileSync(captureProvPath, 'utf8')) as Record<
        string,
        unknown
      >;
      captureProv.execution_witness_hash_v2 =
        '1111111111111111111111111111111111111111111111111111111111111111';
      writeFileSync(captureProvPath, `${JSON.stringify(captureProv, null, 2)}\n`);
    });

    try {
      assert.throws(
        () =>
          resolveTrackRCaptureBinding({
            captureId: CAPTURE_2014Z_ID,
            archivePath: dir,
          }),
        /conflicting execution_witness_hash_v2 between provenance files/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
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
  it('returns consent_recorded_cas_required when v2 triad is signed but CAS probe is skipped', async () => {
    const result = await verifyTrackRExecutionReadiness({
      probeFreshCas: false,
    });

    assert.equal(result.capture_id, CAPTURE_2014Z_ID);
    assert.equal(result.lineage_snapshot_version, 'v2');
    assert.equal(result.readiness_status, 'consent_recorded_cas_required');
    assert.equal(result.execution_authorized, false);
    assert.ok(
      result.checks.some(
        (row) => row.check === 'governance_human_consent' && row.result === 'pass',
      ),
    );
    assert.ok(
      result.checks.some(
        (row) => row.check === 'governance_zeus_adopt' && row.result === 'pass',
      ),
    );
    assert.ok(
      result.checks.some(
        (row) => row.check === 'governance_eve_adopt' && row.result === 'pass',
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
    assert.ok(
      guard.errors.some((error) =>
        error.includes('lineage snapshot version missing or unsupported'),
      ),
    );
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
      attested_execution_witness_hash: CAPTURE_2014Z_EXPECTED_HASHES.execution_witness_hash,
      preflight_read_only: true,
      live_seal_witness_export: null,
    });

    assert.equal(guard.ok, false);
    assert.ok(!guard.errors.some((error) => error.includes('version missing')));
    assert.ok(
      !guard.errors.some((error) =>
        error.includes('lineage snapshot version missing or unsupported'),
      ),
    );
    assert.ok(!guard.errors.some((error) => error.includes('attested execution witness hash required')));
  });

  it('resolves Capture #8 stability witness from archived package (non-governance v1 binding)', () => {
    const binding = resolveTrackRCaptureBinding({
      captureId: 'track-r-c403-2026-08-15T2012Z',
    });
    assert.equal(binding.capture_id, 'track-r-c403-2026-08-15T2012Z');
    assert.equal(binding.lineage_snapshot_version, 'v1');
    assert.equal(
      binding.attestation_hashes.lineage_snapshot_hash,
      '416ef085c9261a66c0838c653becbe28cfc7f1de716fbfcd3e56856398bd7f92',
    );
  });

  it('keeps Capture #5 archive v1 when only archivePath is supplied', () => {
    const binding = resolveTrackRCaptureBinding({
      archivePath: join(process.cwd(), 'artifacts/C-403/track-r-live-dry-run/history/capture-0123Z'),
    });
    assert.equal(binding.capture_id, 'track-r-c403-2026-08-15T0123Z');
    assert.equal(binding.lineage_snapshot_version, 'v1');
  });
});
