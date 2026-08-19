// C-408 Evidence Commons UI labels and broker facade contracts
// Run: tsx tests/contract/evidenceCommons.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DECISION_OPERATOR_LABEL,
  acquisitionOperatorLabel,
} from '../../lib/evidence/types';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function readRepoFile(rel: string): string {
  return readFileSync(join(repoRoot, rel), 'utf8');
}

describe('Evidence Commons (C-408)', () => {
  it('defines explicit operator labels for cache decisions', () => {
    assert.equal(DECISION_OPERATOR_LABEL.FRESH_HIT, 'CACHED · NO NEW PAYMENT');
    assert.equal(DECISION_OPERATOR_LABEL.REVALIDATE, 'REFRESH REQUIRED');
    assert.match(DECISION_OPERATOR_LABEL.STALE_ALLOWED, /HISTORICAL/);
  });

  it('marks mock acquisition as simulated', () => {
    assert.equal(acquisitionOperatorLabel('MOCK_X402'), 'SIMULATED ACQUISITION');
  });

  it('broker client uses POST payload read, not query includePayload', () => {
    const src = readRepoFile('lib/evidence/brokerClient.ts');
    assert.match(src, /brokerReadPayload/);
    assert.match(src, /\/payload`/);
    assert.match(src, /degraded/);
    assert.match(src, /cache: 'no-store'/);
    assert.doesNotMatch(src, /includePayload=true/);
    assert.doesNotMatch(src, /MOCK_PACKET/);
  });

  it('evidence list view surfaces broker degraded state', () => {
    const src = readRepoFile('components/epicon/evidence/EvidencePacketViews.tsx');
    assert.match(src, /Broker degraded/);
    assert.match(src, /No invented packets/);
  });

  it('detail view keeps observation section separate', () => {
    const src = readRepoFile('components/epicon/evidence/EvidencePacketViews.tsx');
    assert.match(src, /Observation/);
    assert.match(src, /Reuse lineage/);
    assert.match(src, /independent sources/);
  });

  it('EPICON chamber links to evidence subchamber route', () => {
    const src = readRepoFile('app/terminal/epicon/page.tsx');
    assert.match(src, /\/terminal\/epicon\/evidence/);
  });
});
