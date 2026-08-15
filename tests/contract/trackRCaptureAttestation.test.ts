// C-403: Track R capture #5 governance attestation verification (offline)
// Run: tsx tests/contract/trackRCaptureAttestation.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
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
});
