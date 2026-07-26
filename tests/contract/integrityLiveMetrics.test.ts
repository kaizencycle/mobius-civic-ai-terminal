// C-384 PR-4: live integrity paths must not import lib/mock fixtures for MIC/MII.
// Run: tsx tests/contract/integrityLiveMetrics.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  provisionalFromEchoIntegrity,
  provisionalFromKvTotals,
  resolveMicSupply,
} from '../../lib/integrity/economyMetrics.ts';

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

  it('buildStatus wires economy snapshot (supply vs provisional separated)', () => {
    const src = readRepoFile('lib/integrity/buildStatus.ts');
    assert.match(src, /resolveIntegrityEconomySnapshot/);
    assert.match(src, /totalMicProvisional/);
    assert.doesNotMatch(src, /integrityStatus\.mic_supply/);
    assert.doesNotMatch(src, /integrityStatus\.mii_baseline/);
  });

  it('provisional KV totals reject stale cycle', () => {
    const row = provisionalFromKvTotals(
      { cycle: 'C-383', totalMicProvisional: 99, totalMicMinted: 99 },
      'C-384',
    );
    assert.equal(row, null);
    const ok = provisionalFromKvTotals(
      { cycle: 'C-384', totalMicProvisional: 12, totalMicMinted: 12 },
      'C-384',
    );
    assert.equal(ok?.totalMicProvisional, 12);
    assert.equal(ok?.mic_provisional_source, 'kv');
  });

  it('provisional echo accepts current-cycle zero totals', () => {
    const row = provisionalFromEchoIntegrity(
      {
        cycleId: 'C-384',
        timestamp: '2026-07-26T00:00:00Z',
        eventCount: 0,
        avgMii: 0.9,
        totalGiDelta: 0,
        totalMicProvisional: 0,
        totalMicMinted: 0,
        agentAverages: {},
        ratings: [],
      },
      'C-384',
    );
    assert.equal(row?.totalMicProvisional, 0);
    assert.equal(row?.mic_provisional_source, 'echo');
  });

  it('mic_supply stays unavailable until attested mint source exists', async () => {
    const supply = await resolveMicSupply();
    assert.equal(supply.mic_supply, null);
    assert.equal(supply.mic_supply_source, 'unavailable');
  });

  it('integrity-status does not re-resolve MIC provisional after payload', () => {
    const src = readRepoFile('app/api/integrity-status/route.ts');
    assert.doesNotMatch(src, /resolveEchoMicProvisionalFields/);
  });

  it('EVE synthesis input exposes GI/MII provenance fields', () => {
    const src = readRepoFile('lib/eve/governance-synthesis.ts');
    assert.match(src, /gi_provenance/);
    assert.match(src, /mii_provenance/);
    assert.doesNotMatch(src, /integrityStatus\.global_integrity/);
  });
});
