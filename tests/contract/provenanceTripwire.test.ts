// OPT-16(C-352): Contract test for T3 Provenance Break tripwire.
// Per MOBIUS_TRUST_TRIPWIRES_V1.md §3.1.
// TODO: wire evaluateProvenance to lib/integrity/tripwires.ts when implemented.
//
// Run: tsx tests/contract/provenanceTripwire.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

type EpiconEvent = {
  id: string;
  source?: string;
  derivedFrom?: string;
};

type ProvenanceSeverity = 'nominal' | 'elevated' | 'critical';

type ProvenanceResult = {
  severity: ProvenanceSeverity;
  consecutiveBreaks: number;
};

// Stub — replace with import from lib/integrity/tripwires.ts when implemented
function evaluateProvenance(events: EpiconEvent[]): ProvenanceResult {
  let consecutiveBreaks = 0;
  for (const e of events) {
    const missingSource = !e.source;
    const brokenDerivedFrom = e.derivedFrom !== undefined && e.derivedFrom.trim() === '';
    if (missingSource || brokenDerivedFrom) {
      consecutiveBreaks++;
    } else {
      consecutiveBreaks = 0;
    }
  }
  const severity: ProvenanceSeverity =
    consecutiveBreaks === 0 ? 'nominal' : consecutiveBreaks >= 3 ? 'critical' : 'elevated';
  return { severity, consecutiveBreaks };
}

describe('T3 Provenance Break tripwire', () => {
  it('valid event with source and derivedFrom → nominal', () => {
    const events: EpiconEvent[] = [
      { id: 'e1', source: 'ECHO', derivedFrom: 'ledger:block:42' },
    ];
    const result = evaluateProvenance(events);
    assert.strictEqual(result.severity, 'nominal');
  });

  it('event missing source → elevated', () => {
    const events: EpiconEvent[] = [
      { id: 'e2', derivedFrom: 'ledger:block:42' },
    ];
    const result = evaluateProvenance(events);
    assert.strictEqual(result.severity, 'elevated');
  });

  it('event with broken derivedFrom (empty string) → elevated', () => {
    const events: EpiconEvent[] = [
      { id: 'e3', source: 'ECHO', derivedFrom: '' },
    ];
    const result = evaluateProvenance(events);
    assert.strictEqual(result.severity, 'elevated');
  });

  it('3 consecutive provenance breaks → critical', () => {
    const events: EpiconEvent[] = [
      { id: 'e4' },
      { id: 'e5' },
      { id: 'e6' },
    ];
    const result = evaluateProvenance(events);
    assert.strictEqual(result.severity, 'critical');
    assert.strictEqual(result.consecutiveBreaks, 3);
  });
});
