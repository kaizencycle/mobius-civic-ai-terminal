// C-465 — durable tripwire authority (Part B). Run: tsx tests/contract/c465TripwireAuthority.test.ts
//
// Simulates "cold instance" scenarios by driving the pure merge function
// directly with hand-constructed memory/KV readings, and by resetting
// lib/tripwire/store.ts's module-level state via __resetTripwireStoreForTests()
// between cases — the closest in-process equivalent to a fresh serverless
// instance, since each contract-test *file* already runs as its own tsx
// process (scripts/run-tests.ts), but cases within one file share a process.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeTripwireState,
  tripwireKvRowToRuntimeState,
  hasEvaluatedTripwireInMemory,
  __resetTripwireStoreForTests,
  type RuntimeTripwireState,
} from '@/lib/tripwire/store';
import { readTripwireDalSnapshot } from '@/lib/dal/tripwire';
import { getParallelReadTripwireStatus } from '@/lib/dal/tripwireParity';
import { readFileSync } from 'node:fs';
import { applyDecisionStateOverlay, buildDecisionStateOverlay } from '@/lib/sustain/decisionStateOverlay';
import { computeSustainGate } from '@/lib/sustain/readSustainGate';
import { deriveOperationalDecisionState } from '@/lib/integrity/operationalState';

function elevatedState(overrides: Partial<RuntimeTripwireState> = {}): RuntimeTripwireState {
  return {
    active: true,
    level: 'elevated',
    reason: 'Hormuz Transit Fee Risk — escalate',
    last_updated: new Date().toISOString(),
    ...overrides,
  };
}

describe('C-465 T1-T3: mergeTripwireState provenance', () => {
  it('T1 — memory baseline (unevaluated), KV elevated fresh -> source=kv, level carried through', () => {
    const kv = elevatedState();
    const result = mergeTripwireState({
      memory: { active: false, level: 'none', reason: 'baseline', last_updated: new Date().toISOString() },
      memoryEvaluated: false,
      kv,
    });
    assert.equal(result.source, 'kv');
    assert.equal(result.level, 'elevated');
    assert.equal(result.active, true);
  });

  it('T2 — memory active/elevated (evaluated), KV absent -> source=memory', () => {
    const memory = elevatedState();
    const result = mergeTripwireState({ memory, memoryEvaluated: true, kv: null });
    assert.equal(result.source, 'memory');
    assert.equal(result.level, 'elevated');
  });

  it('T3 — memory baseline (unevaluated), KV row already decayed to clear -> source is still kv, not baseline', () => {
    // applyTripwireDecayInPlace() (lib/kv/store.ts) already reduces a >2h-old
    // elevated row to elevated:false before loadTripwireState() returns it —
    // mergeTripwireState receives an already-decayed reading here.
    const decayedKvRow = tripwireKvRowToRuntimeState({
      elevated: false,
      tripwireCount: 0,
      timestamp: new Date().toISOString(),
    });
    const result = mergeTripwireState({
      memory: { active: false, level: 'none', reason: 'baseline', last_updated: new Date().toISOString() },
      memoryEvaluated: false,
      kv: decayedKvRow,
    });
    assert.equal(result.source, 'kv');
    assert.equal(result.active, false);
  });

  it('T4a — memory baseline, KV absent -> source=baseline (not clear)', () => {
    const result = mergeTripwireState({
      memory: { active: false, level: 'none', reason: 'baseline', last_updated: new Date().toISOString() },
      memoryEvaluated: false,
      kv: null,
    });
    assert.equal(result.source, 'baseline');
  });

  it('memory elevated beats a clear KV reading (worst wins)', () => {
    const result = mergeTripwireState({
      memory: elevatedState(),
      memoryEvaluated: true,
      kv: { active: false, level: 'none', reason: 'clear', last_updated: new Date().toISOString() },
    });
    assert.equal(result.source, 'merged');
    assert.equal(result.active, true);
  });

  it('a KV elevated reading beats a clear memory reading (worst wins, both real)', () => {
    const result = mergeTripwireState({
      memory: { active: false, level: 'none', reason: 'clear', last_updated: new Date().toISOString() },
      memoryEvaluated: true,
      kv: elevatedState(),
    });
    assert.equal(result.source, 'merged');
    assert.equal(result.active, true);
  });
});

describe('C-465 T4b: decision_state overlay forces tripwire_state=unknown on baseline', () => {
  it('baseline source overrides tripwire_state to unknown and appends an explicit caveat', () => {
    const decisionState = deriveOperationalDecisionState({
      gi: 0.81,
      tripwire_active: false,
      kv_continuity_ok: true,
      degraded_agent_count: 0,
      gi_degraded: false,
    });
    assert.equal(decisionState.tripwire_state, 'clear', 'sanity: unmodified derivation reports clear for inactive tripwire');

    const overlay = buildDecisionStateOverlay({
      gi: 0.81,
      tripwireSource: 'baseline',
      tripwireLastUpdated: new Date().toISOString(),
      sustainGate: computeSustainGate(null),
    });
    const applied = applyDecisionStateOverlay(decisionState, overlay);

    assert.equal(applied.tripwire_state, 'unknown', 'T4: must not claim an affirmative clear on baseline');
    assert.match(applied.decision_summary, /tripwire status unknown/);
  });

  it('a real "kv" or "memory" source leaves the derived tripwire_state untouched', () => {
    const decisionState = deriveOperationalDecisionState({
      gi: 0.81,
      tripwire_active: false,
      kv_continuity_ok: true,
      degraded_agent_count: 0,
      gi_degraded: false,
    });
    const overlay = buildDecisionStateOverlay({
      gi: 0.81,
      tripwireSource: 'kv',
      tripwireLastUpdated: new Date().toISOString(),
      sustainGate: computeSustainGate(null),
    });
    const applied = applyDecisionStateOverlay(decisionState, overlay);
    assert.equal(applied.tripwire_state, 'clear');
    assert.doesNotMatch(applied.decision_summary, /tripwire status unknown/);
  });
});

describe('C-465 T5: GET /api/tripwire/status must never write', () => {
  it('the GET handler source contains no KV write call', () => {
    const source = readFileSync(new URL('../../app/api/tripwire/status/route.ts', import.meta.url), 'utf8');
    const getStart = source.indexOf('export async function GET(');
    const postStart = source.indexOf('export async function POST(');
    assert.ok(getStart !== -1 && postStart !== -1 && getStart < postStart, 'expected GET to precede POST in this file');
    const getBody = source.slice(getStart, postStart);
    for (const writeCall of ['kvSet(', 'kvSetRawKey(', 'saveTripwireState(', 'writeTripwireKvState(']) {
      assert.ok(
        !getBody.includes(writeCall),
        `GET handler must not call ${writeCall} — W7 clobber regression (a cold instance's baseline must never be written back to KV on a read)`,
      );
    }
  });

  it('calling GET repeatedly never flips hasEvaluatedTripwireInMemory() (it must stay read-only on the in-memory store too)', async () => {
    __resetTripwireStoreForTests();
    assert.equal(hasEvaluatedTripwireInMemory(), false);
    const { GET } = await import('@/app/api/tripwire/status/route');
    await GET();
    await GET();
    assert.equal(hasEvaluatedTripwireInMemory(), false, 'GET must never call setTripwireState()');
  });
});

describe('C-465 T6: DAL tripwire snapshot is independent of the runtime store (real parity, not tautological)', () => {
  it('readTripwireDalSnapshot degrades honestly when KV has no record (not a silent "clear")', async () => {
    const result = await readTripwireDalSnapshot();
    // No Redis is configured in this sandbox, so the KV row is always absent —
    // this is itself the regression case W8 could never exercise (the old
    // implementation read the SAME memory the legacy side read, so it could
    // never independently report "no data" here).
    assert.equal(result.ok, false);
    assert.equal(result.provenance.source, 'kv');
    assert.equal(result.error, 'no_persisted_tripwire_record');
  });

  it('getParallelReadTripwireStatus() reports mismatch when legacy (memory) and DAL (KV) genuinely disagree', () => {
    assert.equal(getParallelReadTripwireStatus(true, false, true), 'mismatch');
    assert.equal(getParallelReadTripwireStatus(false, true, true), 'mismatch');
    assert.equal(getParallelReadTripwireStatus(true, true, true), 'matched');
    assert.equal(getParallelReadTripwireStatus(true, null, true), 'legacy_only');
    assert.equal(getParallelReadTripwireStatus(true, true, false), 'dal_degraded');
  });
});
