// C-332: a reserve block that is locally attested but FAILED substrate attestation
// must not render as a green 'proof' timeline event — that contradicts both the
// substrate-error incident event for the same seal and the counts fix
// (substrate_immortalized vs attested). Reproduces the live ledger-400 condition.
//
// Run: tsx tests/contract/canonTimelineSeverity.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { reserveBlockToTimelineForTest } from '../../lib/substrate/canon.ts';
import type { CanonReserveBlockView } from '../../lib/substrate/canon.ts';

function block(opts: {
  status?: string;
  attestation_state?: string;
  attestation_id?: string | null;
  event_hash?: string | null;
  error?: string | null;
  needs_reattestation?: boolean;
}): CanonReserveBlockView {
  return {
    type: 'reserve_block',
    block_number: 1,
    amount: 50,
    status: (opts.status ?? 'attested') as CanonReserveBlockView['status'],
    fountain_status: 'locked',
    seal_id: 'seal-C-332-1',
    seal_hash: 'h',
    previous_seal_hash: null,
    cycle_at_seal: 'C-332',
    sealed_at: new Date().toISOString(),
    gi_at_seal: 0.8,
    mode_at_seal: 'green',
    source_entries: 0,
    deposit_hashes_count: 0,
    attestation_state: (opts.attestation_state ?? 'complete') as CanonReserveBlockView['attestation_state'],
    missing_agents: [],
    attestations: [],
    substrate_pointer: {
      attestation_id: opts.attestation_id ?? null,
      event_hash: opts.event_hash ?? null,
      attested_at: null,
      error: opts.error ?? null,
    },
    replay_promotion: null,
    needs_reattestation: opts.needs_reattestation ?? false,
    historical_digest: null,
  } as unknown as CanonReserveBlockView;
}

function reserveEvent(events: ReturnType<typeof reserveBlockToTimelineForTest>) {
  return events.find((e) => e.type === 'reserve_block')!;
}

describe('canon timeline severity respects substrate attestation reality', () => {
  it('LIVE C-332: locally attested + ledger-400 error → reserve event is NOT proof', () => {
    const events = reserveBlockToTimelineForTest(
      block({
        status: 'attested',
        attestation_state: 'complete',
        error: 'Error: ledger 400: {"detail":"No API base configured for terminal"}',
      }),
    );
    const re = reserveEvent(events);
    assert.notStrictEqual(re.severity, 'proof');
    assert.strictEqual(re.severity, 'watch');
    // the separate substrate-error incident event still fires
    assert.ok(events.some((e) => e.id.startsWith('substrate-error:') && e.severity === 'incident'));
  });

  it('truly immortalized block (pointer present, no error) → reserve event IS proof', () => {
    const events = reserveBlockToTimelineForTest(
      block({ status: 'attested', attestation_state: 'complete', attestation_id: 'evt-1', event_hash: 'h1' }),
    );
    assert.strictEqual(reserveEvent(events).severity, 'proof');
  });

  it('locally attested, no substrate pointer, no error → stays proof (nothing failed)', () => {
    // Fix is minimal: only downgrades blocks whose substrate attestation actually
    // errored. A freshly-sealed block awaiting first attestation (no pointer, no
    // error) stays proof — over-downgrading would paint every new seal as degraded.
    const events = reserveBlockToTimelineForTest(
      block({ status: 'attested', attestation_state: 'complete' }),
    );
    assert.strictEqual(reserveEvent(events).severity, 'proof');
  });

  it('needs_reattestation block → incident', () => {
    const events = reserveBlockToTimelineForTest(
      block({ status: 'quarantined', attestation_state: 'timed_out', needs_reattestation: true }),
    );
    assert.strictEqual(reserveEvent(events).severity, 'incident');
  });
});
