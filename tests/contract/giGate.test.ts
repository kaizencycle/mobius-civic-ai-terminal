// C-384 PR-3: GI merge gate uses real computeGI + can fail on sub-minimum fixture.
// Run: tsx tests/contract/giGate.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeGI } from '../../lib/gi/compute.js';
import { GI_MERGE_GATE_MINIMUM } from '../../lib/gi/gatePolicy.js';
import { GI_FLOOR } from '../../lib/gi/disclosure.js';
import {
  mergeGateFailureMessage,
  resolveGiForGate,
  runMergeGateSelfTest,
} from '../../scripts/ci/gi-gate-lib.mts';

describe('GI merge gate (C-384 PR-3)', () => {
  it('merge minimum is tied to GI_FLOOR until R-1', () => {
    assert.equal(GI_MERGE_GATE_MINIMUM, GI_FLOOR);
  });

  it('local compute path returns a finite GI', async () => {
    const prev = process.env.GI_GATE_SNAPSHOT_URL;
    delete process.env.GI_GATE_SNAPSHOT_URL;
    try {
      const { gi, source } = await resolveGiForGate();
      assert.equal(source, 'local:computeGI');
      assert.ok(Number.isFinite(gi) && gi >= 0 && gi <= 1);
    } finally {
      if (prev !== undefined) process.env.GI_GATE_SNAPSHOT_URL = prev;
    }
  });

  it('degraded compute floors published GI at GI_FLOOR (gate vs minimum)', () => {
    const low = computeGI({
      zeusScores: [0.1],
      freshness: 'stale',
      tripwire: 'elevated',
      activeAgents: 0,
    });
    assert.ok(low.raw_integrity < GI_MERGE_GATE_MINIMUM);
    assert.equal(low.global_integrity, GI_MERGE_GATE_MINIMUM);
    assert.equal(low.gi_floored, true);
  });

  it('mergeGateFailureMessage encodes pass and fail', () => {
    assert.ok(mergeGateFailureMessage(GI_MERGE_GATE_MINIMUM - 0.01, GI_MERGE_GATE_MINIMUM));
    assert.equal(mergeGateFailureMessage(GI_MERGE_GATE_MINIMUM, GI_MERGE_GATE_MINIMUM), null);
  });

  it('runMergeGateSelfTest exercises failure and pass branches', () => {
    runMergeGateSelfTest(GI_MERGE_GATE_MINIMUM);
  });
});
