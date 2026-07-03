// OPT-15(C-360): Contract test for T4 Journal Quality Drift tripwire.
// Per MOBIUS_TRUST_TRIPWIRES_V1.md §3.3.
//
// Run: pnpm exec tsx tests/contract/journalQualityTripwire.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateJournalQuality } from '@/lib/tripwire/journalQuality';

describe('T4 Journal Quality Drift tripwire', () => {
  it('5 normal-length entries → nominal', () => {
    const entries = Array.from({ length: 5 }, (_, i) => ({
      content: `Entry ${i}: This is a detailed journal entry with sufficient content to pass quality checks. Agent performed analysis.`,
      derivedFrom: [`source:${i}`],
    }));
    const result = evaluateJournalQuality(entries);
    assert.strictEqual(result.status, 'nominal');
  });

  it('5 entries shorter than 50 chars → elevated', () => {
    const entries = Array.from({ length: 5 }, () => ({
      content: 'Short.',
    }));
    const result = evaluateJournalQuality(entries);
    assert.strictEqual(result.status, 'elevated');
  });

  it('3 identical entries → repetition flag set', () => {
    const repeated = 'This exact sentence appears three times in the journal log.';
    const entries = [
      { content: repeated },
      { content: repeated },
      { content: repeated },
    ];
    const result = evaluateJournalQuality(entries);
    assert.strictEqual(result.repetition, true);
  });
});
