// C-403: Track R execution readiness verification (governance + optional CAS probe)
// Run: tsx tests/contract/trackRExecutionReadiness.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  verifyTrackRExecutionReadiness,
  TRACK_R_GOVERNANCE_ATTESTATION_PATH,
  TRACK_R_IMMUTABLE_ARCHIVE,
} from '@/lib/watchdog/batchRepair/verifyTrackRExecutionReadiness';
import { CAPTURE_0123Z_ID } from '@/lib/watchdog/batchRepair/verifyTrackRCaptureAttestation';

const GOVERNANCE = join(process.cwd(), TRACK_R_GOVERNANCE_ATTESTATION_PATH);
const ARCHIVE = join(process.cwd(), TRACK_R_IMMUTABLE_ARCHIVE);

function withTempGovernance(mutator: (path: string) => void): string {
  const dir = mkdtempSync(join(tmpdir(), 'track-r-governance-'));
  const path = join(dir, 'TRACK_R_GOVERNANCE_ATTESTATION_capture-0123Z.json');
  cpSync(GOVERNANCE, path);
  mutator(path);
  return path;
}

describe('Track R execution readiness verification', () => {
  it('returns awaiting_human_consent when governance and attestation pass (CAS probe skipped)', async () => {
    const result = await verifyTrackRExecutionReadiness({
      archivePath: ARCHIVE,
      governancePath: GOVERNANCE,
      probeFreshCas: false,
      verifiedAt: '2026-08-15T13:28:00.000Z',
    });

    assert.equal(result.capture_id, CAPTURE_0123Z_ID);
    assert.equal(result.readiness_status, 'awaiting_human_consent');
    assert.equal(result.execution_authorized, false);
    assert.ok(
      result.checks.some((row) => row.check === 'governance_zeus_adopt' && row.result === 'pass'),
    );
    assert.ok(
      result.checks.some((row) => row.check === 'governance_eve_adopt' && row.result === 'pass'),
    );
    assert.ok(
      result.checks.some((row) => row.check === 'governance_human_pending' && row.result === 'pass'),
    );
    assert.ok(
      result.checks.some((row) => row.check === 'attestation_summary' && row.result === 'pass'),
    );
    assert.ok(
      result.checks.some((row) => row.check === 'fresh_cas_probe' && row.result === 'warn'),
    );
  });

  it('never sets execution_authorized true', async () => {
    const result = await verifyTrackRExecutionReadiness({
      archivePath: ARCHIVE,
      governancePath: GOVERNANCE,
      probeFreshCas: false,
    });

    assert.equal(result.execution_authorized, false);
  });

  it('returns blocked when governance attestation is missing', async () => {
    const result = await verifyTrackRExecutionReadiness({
      archivePath: ARCHIVE,
      governancePath: join(process.cwd(), 'docs/epicon/cycles/C-403/does-not-exist.json'),
      probeFreshCas: false,
    });

    assert.equal(result.readiness_status, 'blocked');
    assert.equal(result.execution_authorized, false);
    assert.ok(
      result.checks.some((row) => row.check === 'governance_attestation' && row.result === 'fail'),
    );
  });

  it('returns blocked when ZEUS ADOPT is not recorded in governance JSON', async () => {
    const governancePath = withTempGovernance((path) => {
      const governance = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
      const verdicts = governance.governance_verdicts as Record<string, Record<string, string>>;
      verdicts.zeus = { verdict: 'pending', manifest_field: 'pending' };
      writeFileSync(path, `${JSON.stringify(governance, null, 2)}\n`);
    });

    try {
      const result = await verifyTrackRExecutionReadiness({
        archivePath: ARCHIVE,
        governancePath,
        probeFreshCas: false,
      });

      assert.equal(result.readiness_status, 'blocked');
      assert.ok(
        result.checks.some((row) => row.check === 'governance_zeus_adopt' && row.result === 'fail'),
      );
    } finally {
      rmSync(join(governancePath, '..'), { recursive: true, force: true });
    }
  });

  it('returns blocked when governance marks execution authorized', async () => {
    const governancePath = withTempGovernance((path) => {
      const governance = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
      governance.execution_authorized = true;
      writeFileSync(path, `${JSON.stringify(governance, null, 2)}\n`);
    });

    try {
      const result = await verifyTrackRExecutionReadiness({
        archivePath: ARCHIVE,
        governancePath,
        probeFreshCas: false,
      });

      assert.equal(result.readiness_status, 'blocked');
      assert.ok(
        result.checks.some(
          (row) => row.check === 'governance_execution_authorized' && row.result === 'fail',
        ),
      );
    } finally {
      rmSync(join(governancePath, '..'), { recursive: true, force: true });
    }
  });
});
