// C-404: Track R capture binding resolution for parameterized preflight probes
// Run: tsx tests/contract/trackRCaptureBinding.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

  it('defaults to capture-2014Z v2 when capture_id omitted', () => {
    const binding = resolveTrackRCaptureBinding();
    assert.equal(binding.capture_id, 'track-r-c403-2026-08-15T2014Z');
    assert.equal(binding.lineage_snapshot_version, 'v2');
    assert.equal(
      binding.attestation_hashes.lineage_snapshot_hash,
      'b5f781f6992e6d000289ca130eba15d9150e7a2ce59c280384d57a2c149ef9fb',
    );
  });

  it('still resolves capture-0123Z v1 when requested explicitly', () => {
    const binding = resolveTrackRCaptureBinding({
      captureId: 'track-r-c403-2026-08-15T0123Z',
    });
    assert.equal(binding.capture_id, 'track-r-c403-2026-08-15T0123Z');
    assert.equal(binding.lineage_snapshot_version, 'v1');
    assert.equal(
      binding.attestation_hashes.lineage_snapshot_hash,
      '3db4832725df8d3d49942e60dc9ddd00d436fdb741329362b6eb4d6753669af5',
    );
  });

  it('throws for unknown capture_id instead of falling back to capture-0123Z', () => {
    assert.throws(
      () =>
        resolveTrackRCaptureBinding({
          captureId: 'track-r-c403-2026-08-15T9999Z',
        }),
      /no capture archive found for capture_id track-r-c403-2026-08-15T9999Z/,
    );
  });

  it('throws for invalid capture_id format', () => {
    assert.throws(
      () =>
        resolveTrackRCaptureBinding({
          captureId: 'not-a-valid-capture-id',
        }),
      /invalid capture_id format/,
    );
  });

  it('capture-1919Z provenance matches package identity and locked hashes', () => {
    const provenancePath = join(
      process.cwd(),
      'artifacts/C-403/track-r-live-dry-run/history/capture-1919Z/CAPTURE_PROVENANCE.json',
    );
    const provenance = JSON.parse(readFileSync(provenancePath, 'utf8')) as {
      capture_id: string;
      immutable_archive_path: string;
      required_hashes: Record<string, string>;
    };
    const binding = resolveTrackRCaptureBinding({
      captureId: 'track-r-c403-2026-08-15T1919Z',
    });

    assert.equal(provenance.capture_id, binding.capture_id);
    assert.ok(provenance.immutable_archive_path.endsWith('capture-1919Z/'));
    assert.equal(
      provenance.required_hashes.lineage_snapshot_hash,
      binding.attestation_hashes.lineage_snapshot_hash,
    );
    assert.equal(
      provenance.required_hashes.execution_witness_hash,
      binding.attestation_hashes.execution_witness_hash,
    );
  });
});
