// C-410: Civic mesh reconciliation — fail-closed invariants
// Run: tsx tests/contract/c410CivicMeshReconciliation.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveIntegrityDegraded } from '@/lib/integrity/integrityAuthority';
import { deriveQuorumAuthoritySemantics } from '@/lib/mic/quorumSemantics';
import type { SentinelQuorumState } from '@/lib/mic/quorumTracker';
import {
  buildTrackRP3IntakeObservability,
  getLatestIssuedPacketRunIdFromRepo,
} from '@/lib/trackR/p3IntakeObservability';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const substrateCyclePath = join(repoRoot, '..', 'Mobius-Substrate', 'cycle.json');
const c410LedgerFixturePath = join(
  repoRoot,
  'tests/fixtures/c410-reconciliation/ledger-cycle-state-c410.json',
);

function parseGeneratedCycle(markdown: string): string | null {
  const match = markdown.match(/-\s+\*\*Cycle:\*\*\s+`([^`]+)`/);
  return match?.[1] ?? null;
}

function readRepoFile(rel: string): string {
  return readFileSync(join(repoRoot, rel), 'utf8');
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

function readSubstrateCycleOptional(): Record<string, unknown> | null {
  if (!existsSync(substrateCyclePath)) {
    return null;
  }

  let raw: string;
  try {
    raw = readFileSync(substrateCyclePath, 'utf8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return null;
    }
    throw err;
  }

  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch (err) {
    assert.fail(`Substrate cycle.json is not valid JSON: ${(err as Error).message}`);
  }
}

function baseQuorum(overrides: Partial<SentinelQuorumState> = {}): SentinelQuorumState {
  return {
    schema: 'SENTINEL_QUORUM_V1',
    cycle: 'C-410',
    required: ['ATLAS', 'ZEUS', 'EVE', 'JADE', 'AUREA'],
    entries: {},
    attestations_received: 5,
    attestations_needed: 5,
    status: 'achieved',
    initiated_at: '2026-08-21T00:00:00.000Z',
    completed_at: '2026-08-21T00:00:00.000Z',
    updatedAt: '2026-08-21T00:00:00.000Z',
    ...overrides,
  };
}

describe('C-410 civic mesh reconciliation', () => {
  it('C-410 reconciliation fixture locks cycle and fail-closed ledger posture', () => {
    const fixture = readJson(c410LedgerFixturePath);
    assert.equal(fixture.schema, 'MOBIUS_CYCLE_STATE_V2');
    assert.equal(fixture.cycle, 'C-410');
    assert.equal(fixture.gi, 0.81);
    assert.equal(fixture.degraded, true);
    assert.equal(fixture.source, 'snapshot-lite+vault+manifest');
    assert.ok((fixture.open_gates as string[]).includes('terminal_degraded'));
  });

  it('committed terminal ledger keeps fail-closed MOBIUS_CYCLE_STATE_V2 invariants', () => {
    const ledger = readJson(join(repoRoot, 'ledger/cycle-state.json'));
    assert.equal(ledger.schema, 'MOBIUS_CYCLE_STATE_V2');
    assert.match(String(ledger.cycle), /^C-\d+$/);
    assert.equal(ledger.degraded, true);
    assert.equal(typeof ledger.gi, 'number');
    assert.ok(Array.isArray(ledger.open_gates));
    assert.ok((ledger.open_gates as string[]).includes('terminal_degraded'));
    assert.equal(ledger.source, 'snapshot-lite+vault+manifest');
  });

  it('live ledger cycle matches generated CURRENT_CYCLE.md block', () => {
    const ledger = readJson(join(repoRoot, 'ledger/cycle-state.json'));
    const generatedCycle = parseGeneratedCycle(readRepoFile('CURRENT_CYCLE.md'));
    assert.ok(generatedCycle, 'CURRENT_CYCLE.md must expose generated cycle block');
    assert.equal(ledger.cycle, generatedCycle);
  });

  it('reconciliation report documents C-410 non-averaged GI disagreement', () => {
    const report = readRepoFile('docs/epicon/cycles/C-410/C410_CIVIC_MESH_RECONCILIATION.md');
    assert.match(report, /C-410/);
    assert.match(report, /not averaged/i);
    assert.match(report, /0\.64/);
    assert.match(report, /0\.81/);
    assert.match(report, /DISPUTED/);
  });

  it('missing ZEUS provenance keeps degraded fail-closed posture', () => {
    const degraded = resolveIntegrityDegraded({
      giDegraded: false,
      kvOk: true,
      integrityLaneOk: true,
      mode: 'green',
      tripwireElevated: false,
      gicAvailable: true,
      zeusVerificationStatus: 'unknown',
    });
    assert.equal(degraded, true);
  });

  it('receipt quorum cannot be interpreted as seal eligibility or execution authority', () => {
    const semantics = deriveQuorumAuthoritySemantics(baseQuorum(), {
      verification_status: 'disputed',
      candidates_reviewed: 0,
      tripwire_active: true,
    });
    assert.equal(semantics.seal_status, 'receipt_quorum_only');
    assert.equal(semantics.execution_authorized, false);
    assert.equal(semantics.seal_eligibility, 'blocked');
  });

  it('Track R latest issued run remains blocked without packet-bound governance', async () => {
    const latestRunId = getLatestIssuedPacketRunIdFromRepo(repoRoot);
    assert.ok(latestRunId);
    const status = await buildTrackRP3IntakeObservability({
      workflowRunId: latestRunId!,
      repoRoot,
    });
    assert.equal(status.execution_authorized, false);
    assert.equal(status.intake_state, 'AWAITING_INDEPENDENT_REVIEW');
    assert.equal(status.zeus.review_status, 'awaiting_zeus');
    assert.equal(status.eve.review_status, 'awaiting_eve');
    assert.equal(status.human_review_status, 'awaiting_human');
  });

  it('snapshot-lite route keeps execution_authorized false', () => {
    const src = readRepoFile('app/api/terminal/snapshot-lite/route.ts');
    assert.match(src, /execution_authorized:\s*false/);
  });
});

describe('C-410 Substrate cycle pointer (sibling repo)', () => {
  it('substrate cycle.json preserves C-410 reconciliation invariants when checkout present', () => {
    const cycle = readSubstrateCycleOptional();
    if (cycle === null) {
      return;
    }

    const pulse = cycle.operational_pulse as {
      execution_authorized: boolean;
      zeus_disposition: string;
      gi: number;
      canon_lag?: { counting_model?: string };
    };
    const superseded = cycle.superseded_fields as {
      gi?: { former: number; reason: string };
    };

    assert.equal(cycle.current_cycle, 'C-410');
    assert.equal(cycle.gi_status, 'unresolved');
    assert.equal(cycle.gi_editorial_class, 'carry_forward_withheld');
    assert.equal(typeof cycle.gi, 'number');
    assert.equal(typeof pulse.gi, 'number');
    assert.notEqual(pulse.gi, cycle.gi);
    assert.match(String(superseded?.gi?.reason ?? ''), /unresolved|not live authority/i);
    assert.equal(pulse.execution_authorized, false);
    assert.equal(pulse.zeus_disposition, 'disputed');
    assert.equal('next_state_snapshot_expected' in cycle, false);
    assert.equal(pulse.canon_lag?.counting_model, 'invalid_for_canon_lag');
  });
});
