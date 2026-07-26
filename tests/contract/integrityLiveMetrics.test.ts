// C-384 PR-4: live integrity paths must not import lib/mock fixtures for MIC/MII.
// Run: tsx tests/contract/integrityLiveMetrics.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const MOCK_INTEGRITY_IMPORT = /@\/lib\/mock\/integrityStatus|lib\/mock\/integrityStatus/;

const GUARDED_FILES = [
  'lib/integrity/buildStatus.ts',
  'lib/integrity/economyMetrics.ts',
  'lib/eve/governance-synthesis.ts',
];

function readRepoFile(rel: string): string {
  return readFileSync(join(repoRoot, rel), 'utf8');
}

describe('integrity live metrics (C-384 PR-4)', () => {
  it('guarded integrity paths do not import lib/mock/integrityStatus', () => {
    for (const rel of GUARDED_FILES) {
      const src = readRepoFile(rel);
      assert.equal(
        MOCK_INTEGRITY_IMPORT.test(src),
        false,
        `${rel} must not import mock integrityStatus`,
      );
    }
  });

  it('buildStatus wires economy metrics instead of fixture constants', () => {
    const src = readRepoFile('lib/integrity/buildStatus.ts');
    assert.match(src, /resolveIntegrityEconomyMetrics/);
    assert.doesNotMatch(src, /integrityStatus\.mic_supply/);
    assert.doesNotMatch(src, /integrityStatus\.mii_baseline/);
  });

  it('EVE synthesis input exposes GI/MII provenance fields', () => {
    const src = readRepoFile('lib/eve/governance-synthesis.ts');
    assert.match(src, /gi_provenance/);
    assert.match(src, /mii_provenance/);
    assert.doesNotMatch(src, /integrityStatus\.global_integrity/);
  });
});
