// C-384 PR-2: raw_integrity + gi_floored must not be dropped from compute / API surfaces.
// Run: tsx tests/contract/rawIntegrityDisclosure.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeGI } from '../../lib/gi/compute.js';
import { disclosureFromStored, GI_FLOOR } from '../../lib/gi/disclosure.js';

const repoRoot = join(import.meta.dirname, '../..');

describe('raw_integrity disclosure (C-384 PR-2)', () => {
  it('computeGI returns gi_floored when raw is below GI_FLOOR', () => {
    const result = computeGI({
      zeusScores: [0.1],
      freshness: 'stale',
      tripwire: 'elevated',
      activeAgents: 0,
    });
    assert.ok(result.raw_integrity < GI_FLOOR);
    assert.equal(result.global_integrity, GI_FLOOR);
    assert.equal(result.gi_floored, true);
  });

  it('computeGI keeps raw when above floor', () => {
    const result = computeGI({
      zeusScores: [0.9, 0.85],
      freshness: 'fresh',
      tripwire: 'none',
      activeAgents: 8,
    });
    assert.ok(result.raw_integrity >= GI_FLOOR);
    assert.equal(result.global_integrity, result.raw_integrity);
    assert.equal(result.gi_floored, false);
  });

  it('snapshot-lite route exposes raw_integrity and gi_floored on success response', () => {
    const src = readFileSync(
      join(repoRoot, 'app/api/terminal/snapshot-lite/route.ts'),
      'utf8',
    );
    assert.match(src, /raw_integrity:\s*giResolved\.raw_integrity/);
    assert.match(src, /gi_floored:\s*giResolved\.gi_floored/);
  });

  it('legacy KV rows surface null raw until backfill', () => {
    const disc = disclosureFromStored({ global_integrity: 0.72 });
    assert.equal(disc.raw_integrity, null);
    assert.equal(disc.gi_floored, false);
    assert.equal(disc.global_integrity, 0.72);
  });
});
