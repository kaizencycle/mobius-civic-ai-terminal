// C-386: committed journal entries must schedule substrate attest via after(), not bare void.
// Run: tsx tests/contract/journalAttestAfter.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function readRepoFile(rel: string): string {
  return readFileSync(join(repoRoot, rel), 'utf8');
}

describe('journal substrate attest scheduling (C-386)', () => {
  it('uses after() for writeToSubstrate on committed entries', () => {
    const src = readRepoFile('lib/agents/journal.ts');
    assert.match(src, /import\s*\{\s*after\s*\}\s*from\s*'next\/server'/);
    assert.match(src, /function scheduleJournalLedgerAttest/);
    assert.match(src, /try\s*\{[\s\S]*after\(work\)/);
    assert.match(src, /catch\s*\{[\s\S]*work\(\)/);
    assert.match(src, /scheduleJournalLedgerAttest\(attestWork\)/);
  });

  it('identity login allows longer cold-start window', () => {
    const src = readRepoFile('lib/substrate/identityToken.ts');
    assert.match(src, /AbortSignal\.timeout\(20_000\)/);
  });
});
