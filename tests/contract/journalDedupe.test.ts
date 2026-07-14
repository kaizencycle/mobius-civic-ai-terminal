// C-372: journal cron content-hash dedupe.
// Run: tsx tests/contract/journalDedupe.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isJournalDedupeEnabled,
  isJournalDedupeExempt,
  journalContentHash,
  journalDedupeKey,
} from '@/lib/agents/journalDedupe';

describe('journalDedupe', () => {
  const base = {
    agent: 'HERMES',
    cycle: 'C-372',
    scope: 'routing',
    observation: 'HERMES routing sweep for C-372. Elevated micro signals: 1.',
    inference: 'Active routing context: DAEDALUS-µ1: next.js',
    recommendation: 'Keep HERMES-µ narrative lane distinct from ECHO financial EPICONs.',
    confidence: 0.864,
    status: 'committed' as const,
    category: 'observation' as const,
    severity: 'nominal' as const,
    agentOrigin: 'HERMES',
  };

  it('journalContentHash is stable for identical semantic content', () => {
    const a = journalContentHash(base);
    const b = journalContentHash({ ...base, confidence: 0.86400001 });
    assert.strictEqual(a, b);
  });

  it('journalContentHash changes when observation delta is present', () => {
    const a = journalContentHash(base);
    const b = journalContentHash({
      ...base,
      observation: 'HERMES routing sweep for C-372. Elevated micro signals: 2.',
    });
    assert.notStrictEqual(a, b);
  });

  it('alert lane entries are exempt from suppression', () => {
    assert.strictEqual(isJournalDedupeExempt({ category: 'alert', severity: 'elevated' }), true);
    assert.strictEqual(isJournalDedupeExempt({ category: 'observation', severity: 'critical' }), true);
    assert.strictEqual(isJournalDedupeExempt({ category: 'observation', severity: 'nominal' }), false);
  });

  it('journalDedupeKey scopes per agent and category', () => {
    assert.strictEqual(journalDedupeKey('HERMES', 'observation'), 'journal:dedupe:hermes:observation');
  });

  it('isJournalDedupeEnabled respects JOURNAL_DEDUPE=off', () => {
    const prior = process.env.JOURNAL_DEDUPE;
    process.env.JOURNAL_DEDUPE = 'off';
    assert.strictEqual(isJournalDedupeEnabled(), false);
    process.env.JOURNAL_DEDUPE = prior;
  });
});
