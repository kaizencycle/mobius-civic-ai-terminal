// C-404: Track R capture binding resolution for parameterized preflight probes
// Run: tsx tests/contract/trackRCaptureBinding.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveTrackRCaptureArchivePath,
  resolveTrackRCaptureBinding,
} from '@/lib/watchdog/batchRepair/trackRCaptureBinding';

describe('Track R capture binding', () => {
  it('resolves capture-1919Z archive and locked hashes', () => {
    const captureId = 'track-r-c403-2026-08-15T1919Z';
    const archive = resolveTrackRCaptureArchivePath({ captureId });
    assert.ok(archive?.endsWith('history/capture-1919Z'));

    const binding = resolveTrackRCaptureBinding({ captureId });
    assert.equal(binding.capture_id, captureId);
    assert.equal(
      binding.attestation_hashes.lineage_snapshot_hash,
      'd7f91f007c7334faefd8d8d1fbd2c0093610666c321777240de3e230b0a9bc00',
    );
    assert.equal(
      binding.attestation_hashes.execution_witness_hash,
      'eaeeff3866bdfd82a85ef933af5b8342bb2f15d05f79247b882a81d0d67f47af',
    );
  });

  it('defaults to capture-0123Z when capture_id omitted', () => {
    const binding = resolveTrackRCaptureBinding();
    assert.equal(binding.capture_id, 'track-r-c403-2026-08-15T0123Z');
    assert.equal(
      binding.attestation_hashes.lineage_snapshot_hash,
      '3db4832725df8d3d49942e60dc9ddd00d436fdb741329362b6eb4d6753669af5',
    );
  });
});
