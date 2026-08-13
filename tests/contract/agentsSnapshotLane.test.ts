// C-401: agents snapshot lane must degrade when roster includes CONTESTED agents.
// Run: tsx tests/contract/agentsSnapshotLane.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSnapshotLane } from '../../lib/terminal/snapshotLanes.js';

describe('normalizeSnapshotLane(agents)', () => {
  it('reports degraded when any agent is CONTESTED', () => {
    const lane = normalizeSnapshotLane('agents', {
      ok: true,
      status: 200,
      error: null,
      data: {
        ok: true,
        cycle: 'C-401',
        agents: [
          { name: 'ATLAS', liveness: 'CONTESTED' },
          { name: 'ZEUS', liveness: 'CONTESTED' },
          { name: 'EVE', liveness: 'CONTESTED' },
          { name: 'JADE', liveness: 'ACTIVE' },
          { name: 'AUREA', liveness: 'ACTIVE' },
        ],
      },
    });

    assert.strictEqual(lane.state, 'degraded');
    assert.match(lane.message, /contested/);
  });

  it('stays healthy when roster has no contested agents', () => {
    const lane = normalizeSnapshotLane('agents', {
      ok: true,
      status: 200,
      error: null,
      data: {
        ok: true,
        agents: [{ name: 'ATLAS', liveness: 'ACTIVE' }],
      },
    });

    assert.strictEqual(lane.state, 'healthy');
  });
});
