// C-403: Track R capture #5 governance attestation verification (offline)
// Run: tsx tests/contract/trackRCaptureAttestation.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  verifyTrackRCaptureAttestation,
  CAPTURE_0123Z_ID,
  CAPTURE_0123Z_EXPECTED_HASHES,
} from '@/lib/watchdog/batchRepair/verifyTrackRCaptureAttestation';

const ARCHIVE = join(
  process.cwd(),
  'artifacts/C-403/track-r-live-dry-run/history/capture-0123Z',
);

function withTempArchive(mutator: (dir: string) => void): string {
  const dir = mkdtempSync(join(tmpdir(), 'track-r-capture-'));
  cpSync(ARCHIVE, dir, { recursive: true });
  mutator(dir);
  return dir;
}

describe('Track R capture #5 attestation verification', () => {
  it('independently verifies capture-0123Z hash packet offline', () => {
    const result = verifyTrackRCaptureAttestation({ archivePath: ARCHIVE });

    assert.equal(result.capture_id, CAPTURE_0123Z_ID);
    assert.equal(result.verification_status, 'adopt_ready');

    for (const [key, expected] of Object.entries(CAPTURE_0123Z_EXPECTED_HASHES)) {
      assert.equal(
        result.recomputed_hashes[key],
        expected,
        `${key} recomputation mismatch`,
      );
    }

    const failed = result.checks.filter((row) => row.result === 'fail');
    assert.equal(failed.length, 0, failed.map((row) => `${row.check}: ${row.detail}`).join('; '));
  });

  it('returns blocked without throwing when required artifacts are missing', () => {
    const missingPath = join(process.cwd(), 'artifacts/C-403/track-r-live-dry-run/history/does-not-exist');
    const result = verifyTrackRCaptureAttestation({ archivePath: missingPath });

    assert.equal(result.verification_status, 'blocked');
    assert.ok(
      result.checks.some((row) => row.check === 'required_artifacts_present' && row.result === 'fail'),
    );
  });

  it('blocks when CAPTURE_PROVENANCE.json hashes diverge from package', () => {
    const dir = withTempArchive((archivePath) => {
      const provenancePath = join(archivePath, 'CAPTURE_PROVENANCE.json');
      const provenance = JSON.parse(readFileSync(provenancePath, 'utf8')) as Record<string, unknown>;
      const required = provenance.required_hashes as Record<string, string>;
      required.semantic_manifest_hash = '0000000000000000000000000000000000000000000000000000000000000000';
      writeFileSync(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`);
    });

    try {
      const result = verifyTrackRCaptureAttestation({ archivePath: dir });
      assert.equal(result.verification_status, 'blocked');
      assert.ok(
        result.checks.some(
          (row) =>
            row.check === 'provenance_crosscheck:semantic_manifest_hash' && row.result === 'fail',
        ),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks when archived manifest semantic fields diverge from rebuilt manifest', () => {
    const dir = withTempArchive((archivePath) => {
      const manifestPath = join(archivePath, 'TRACK_R_MANIFEST_REDACTED.json');
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
      manifest.repair_id = 'tampered-repair-id';
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    });

    try {
      const result = verifyTrackRCaptureAttestation({ archivePath: dir });
      assert.equal(result.verification_status, 'blocked');
      assert.ok(
        result.checks.some(
          (row) => row.check === 'archived_manifest_semantic_match' && row.result === 'fail',
        ),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks when a required artifact contains invalid JSON', () => {
    const dir = withTempArchive((archivePath) => {
      writeFileSync(join(archivePath, 'CAPTURE_PROVENANCE.json'), '{not-valid-json');
    });

    try {
      const result = verifyTrackRCaptureAttestation({ archivePath: dir });
      assert.equal(result.verification_status, 'blocked');
      assert.ok(
        result.checks.some(
          (row) => row.check === 'required_artifacts_readable' && row.result === 'fail',
        ),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
