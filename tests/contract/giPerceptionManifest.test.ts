import assert from 'node:assert/strict';

import { loadIntegrityPerception } from '../../lib/mfs/assemble-perception';

async function main() {
  const payload = await loadIntegrityPerception('locked');

  assert.equal(payload.ok, true);
  assert.equal(payload.schema_version, '0.1');
  assert.equal(payload.gi_perception.schema_version, '0.1');
  assert.equal(payload.fountain_state.schema_version, '0.1');
  assert.ok(typeof payload.gi_perception.gi.value === 'number');
  assert.ok(payload.gi_perception.gi.value >= 0 && payload.gi_perception.gi.value <= 1);
  assert.ok(typeof payload.gi_perception.gi.confidence === 'number');
  assert.ok(Array.isArray(payload.gi_perception.gi.known_blind_spots));
  assert.ok(
    [
      'DORMANT',
      'OBSERVING',
      'APPROACHING',
      'AUDIT_REQUIRED',
      'PROVISIONAL_GI95',
      'SUSTAINED_GI95',
      'REVIEW_WINDOW_OPEN',
      'QUARANTINED',
      'CLOSED',
    ].includes(payload.fountain_state.state),
  );
  assert.ok(typeof payload.fountain_state.public_message === 'string');
  assert.ok(!payload.fountain_state.public_message!.toLowerCase().includes('push gi to 95'));

  console.log('✓ gi perception manifest contract checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
