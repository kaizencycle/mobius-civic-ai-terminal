// C-410: Civic mesh reconciliation — fail-closed invariants
// Run: tsx tests/contract/c410CivicMeshReconciliation.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveIntegrityDegraded } from '@/lib/integrity/integrityAuthority';
import { deriveQuorumAuthoritySemantics } from '@/lib/mic/quorumSemantics';
import type { SentinelQuorumState } from '@/lib/mic/quorumTracker';
import {
  buildTrackRP3IntakeObservability,
  TRACK_R_P3_CANONICAL_RUN,
} from '@/lib/trackR/p3IntakeObservability';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const substrateCyclePath = join(repoRoot, '..', 'Mobius-Substrate', 'cycle.json');

function readRepoFile(rel: string): string {
  return readFileSync(join(repoRoot, rel), 'utf8');
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

function baseQuorum(overrides: Partial<SentinelQuorumState> = {}): SentinelQuorumState {
  return {
    schema: 'SENTINEL_QUORUM_V1',
    cycle: 'C-410',
    required: ['ATLAS', 'ZEUS', 'EVE', 'JADE', 'AUREA'],
    entries: {},
    attestations_received: 5,
    attestations_needed: 5,
    status: 'achieved',
    initiated_at: '2026-08-21T00:00:00.000Z',
    completed_at: '2026-08-21T00:00:00.000Z',
    updatedAt: '2026-08-21T00:00:00.000Z',
    ...overrides,
  };
}

describe('C-410 civic mesh reconciliation', () => {
  it('committed terminal ledger remains on C-410', () => {
    const ledger = readJson(join(repoRoot, 'ledger/cycle-state.json'));
    assert.equal(ledger.cycle, 'C-410');
  });

  it('reconciliation report documents non-averaged GI disagreement', () => {
    const report = readRepoFile('docs/epicon/cycles/C-410/C410_CIVIC_MESH_RECONCILIATION.md');
    assert.match(report, /not averaged/i);
    assert.match(report, /0\.64/);
    assert.match(report, /0\.81/);
    assert.match(report, /DISPUTED/);
  });

  it('missing ZEUS provenance keeps degraded fail-closed posture', () => {
    const degraded = resolveIntegrityDegraded({
      giDegraded: false,
      kvOk: true,
      integrityLaneOk: true,
      mode: 'green',
      tripwireElevated: false,
      gicAvailable: true,
      zeusVerificationStatus: 'unknown',
    });
    assert.equal(degraded, true);
  });

  it('receipt quorum cannot be interpreted as seal eligibility or execution authority', () => {
    const semantics = deriveQuorumAuthoritySemantics(baseQuorum(), {
      verification_status: 'disputed',
      candidates_reviewed: 0,
      tripwire_active: true,
    });
    assert.equal(semantics.seal_status, 'receipt_quorum_only');
    assert.equal(semantics.execution_authorized, false);
    assert.equal(semantics.seal_eligibility, 'blocked');
  });

  it('Track R canonical run remains blocked without packet-bound governance', async () => {
    const status = await buildTrackRP3IntakeObservability({
      workflowRunId: TRACK_R_P3_CANONICAL_RUN,
      repoRoot,
    });
    assert.equal(status.execution_authorized, false);
    assert.equal(status.intake_state, 'NOT_SEEN');
    assert.equal(status.zeus.review_status, 'awaiting_zeus');
    assert.equal(status.eve.review_status, 'awaiting_eve');
    assert.equal(status.human_review_status, 'awaiting_human');
  });

  it('snapshot-lite route keeps execution_authorized false', () => {
    const src = readRepoFile('app/api/terminal/snapshot-lite/route.ts');
    assert.match(src, /execution_authorized:\s*false/);
  });
});

describe('C-410 Substrate cycle pointer (sibling repo)', () => {
  it('substrate cycle.json preserves C-410 and withholds editorial gi when present', () => {
    let cycle: Record<string, unknown>;
    try {
      cycle = readJson(substrateCyclePath);
    } catch {
      // CI may not checkout sibling repo — skip without failing Terminal CI
      return;
    }
    assert.equal(cycle.current_cycle, 'C-410');
    assert.equal(cycle.gi, null);
    assert.equal(cycle.gi_status, 'unresolved');
    assert.equal((cycle.operational_pulse as { execution_authorized: boolean }).execution_authorized, false);
    assert.equal(
      (cycle.operational_pulse as { zeus_disposition: string }).zeus_disposition,
      'disputed',
    );
    assert.equal('next_state_snapshot_expected' in cycle, false);
  });
});
