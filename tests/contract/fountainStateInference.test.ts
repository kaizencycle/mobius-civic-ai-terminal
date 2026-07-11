import assert from 'node:assert/strict';

import { inferFountainState } from '../../lib/mfs/assemble-perception';
import {
  FOUNTAIN_SUSTAIN_GI_THRESHOLD,
  SUSTAIN_GI_THRESHOLD,
  SUSTAIN_REQUIRED_CYCLES,
} from '../../lib/mic/sustainTracker';

function deriveGi95Sustain(gi: number, prevGi95: number): number {
  return gi >= FOUNTAIN_SUSTAIN_GI_THRESHOLD ? prevGi95 + 1 : 0;
}

async function main() {
  const base = {
    gi: FOUNTAIN_SUSTAIN_GI_THRESHOLD,
    giConfidence: 0.8,
    sustainObserved: SUSTAIN_REQUIRED_CYCLES,
    sustainRequired: SUSTAIN_REQUIRED_CYCLES,
    criticalSignals: 0,
    giDegraded: false,
    giStale: false,
    vaultFountainLane: 'active' as const,
  };

  assert.equal(inferFountainState(base), 'REVIEW_WINDOW_OPEN');

  assert.equal(
    inferFountainState({ ...base, giStale: true }),
    'PROVISIONAL_GI95',
    'stale GI must not open review window',
  );

  assert.equal(
    inferFountainState({ ...base, giConfidence: 0.4 }),
    'PROVISIONAL_GI95',
    'low-confidence GI must not open review window',
  );

  assert.equal(
    inferFountainState({ ...base, sustainObserved: 0 }),
    'PROVISIONAL_GI95',
    'GI95 sustain counter required for positive Fountain transitions',
  );

  const giAt75 = 0.8;
  assert.ok(giAt75 >= SUSTAIN_GI_THRESHOLD);
  assert.ok(giAt75 < FOUNTAIN_SUSTAIN_GI_THRESHOLD);
  assert.equal(deriveGi95Sustain(giAt75, 4), 0, '0.75-threshold cycles must not count toward GI95 sustain');
  assert.equal(deriveGi95Sustain(0.96, 4), 5, 'GI≥0.95 cycles must advance GI95-specific counter');

  console.log('✓ fountain state inference + GI95 sustain contract checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
