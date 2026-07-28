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
  it('uses after() with promise-returning attest work', () => {
    const src = readRepoFile('lib/agents/journal.ts');
    assert.match(src, /import\s*\{\s*after\s*\}\s*from\s*'next\/server'/);
    assert.match(src, /export function schedulePostResponseWork/);
    assert.match(src, /export function scheduleAppendAgentJournalEntry/);
    assert.match(src, /const attestWork = \(\) =>\s*\n\s*writeToSubstrate\(/);
    assert.match(src, /scheduleJournalLedgerAttest\(attestWork\)/);
    assert.doesNotMatch(src, /const attestWork = \(\) => \{\s*\n\s*void writeToSubstrate/);
  });

  it('fire-and-forget routes use scheduleAppendAgentJournalEntry', () => {
    for (const rel of [
      'app/api/aurea/oversee/route.ts',
      'app/api/cron/watchdog/route.ts',
      'app/api/zeus/verify/route.ts',
    ]) {
      const src = readRepoFile(rel);
      assert.match(src, /scheduleAppendAgentJournalEntry/);
      assert.doesNotMatch(src, /void appendAgentJournalEntry/);
    }
  });

  it('identity login allows longer cold-start window', () => {
    const src = readRepoFile('lib/substrate/identityToken.ts');
    assert.match(src, /AbortSignal\.timeout\(20_000\)/);
  });
});
