// C-406: Integrity semantics reconciliation — contract tests
// Run: tsx tests/contract/c406IntegritySemantics.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  KV_CONTINUITY_KEY_NAMES,
  KV_CONTINUITY_REQUIRED_KEY_NAMES,
  KV_INVERTED_ABSENCE_OK,
} from '@/lib/kv/kvKeyHealth';
import {
  buildGiRepresentation,
  classifyGiFreshness,
  resolvePersistedAtForSource,
} from '@/lib/integrity/giProvenance';
import {
  deriveOperationalClassification,
  deriveOperationalDecisionState,
} from '@/lib/integrity/operationalState';
import { deriveQuorumAuthoritySemantics } from '@/lib/mic/quorumSemantics';
import type { SentinelQuorumState } from '@/lib/mic/quorumTracker';
import { getGiMode } from '@/lib/gi/mode';
import { buildMicroLiveProvenance } from '@/lib/integrity/microProvenance';
import { buildIntegrityEnrichment } from '@/lib/integrity/buildIntegrityEnrichment';
import type { GiChainResolution } from '@/lib/gi/resolveGiChain';
import type { IntegrityPayload } from '@/lib/integrity/buildStatus';
import type { RuntimeTripwireState } from '@/lib/tripwire/store';

function baseQuorum(overrides: Partial<SentinelQuorumState> = {}): SentinelQuorumState {
  return {
    schema: 'SENTINEL_QUORUM_V1',
    cycle: 'C-406',
    required: ['ATLAS', 'ZEUS', 'EVE', 'JADE', 'AUREA'],
    entries: {},
    attestations_received: 5,
    attestations_needed: 5,
    status: 'achieved',
    initiated_at: '2026-08-17T00:00:00.000Z',
    completed_at: '2026-08-17T00:00:00.000Z',
    updatedAt: '2026-08-17T00:00:00.000Z',
    ...overrides,
  };
}

describe('C-406 GI provenance', () => {
  it('classifies cached GI differing from live micro as degraded/stale', () => {
    const cached = classifyGiFreshness({
      age_seconds: 300,
      degraded: true,
      source: 'kv-carry',
    });
    const live = classifyGiFreshness({
      age_seconds: 0,
      degraded: false,
      source: 'live-compute',
    });
    assert.equal(cached, 'degraded');
    assert.equal(live, 'fresh');
  });

  it('exposes stored vs derived mode divergence without hiding numeric GI', () => {
    const rep = buildGiRepresentation({
      value: 0.81,
      computation_source: 'kv-live',
      persistence_source: 'cached',
      computed_at: '2026-08-17T12:00:00.000Z',
      persisted_at: '2026-08-17T11:50:00.000Z',
      cache_age_seconds: 600,
      degraded: false,
      stored_mode: 'yellow',
      derived_mode: getGiMode(0.81),
    });
    assert.equal(rep.value, 0.81);
    assert.equal(rep.derived_mode, 'green');
    assert.equal(rep.stored_mode, 'yellow');
    assert.equal(rep.mode_diverged, true);
    assert.equal(rep.persistence_source, 'cached');
  });

  it('allows green numeric GI with active tripwire to classify as STRESSED', () => {
    const classification = deriveOperationalClassification({
      gi: 0.81,
      display_state: 'green',
      tripwire_active: true,
      kv_continuity_ok: true,
      degraded_agent_count: 0,
      gi_degraded: false,
      tripwire_elevated: true,
    });
    assert.equal(classification, 'STRESSED');
  });

  it('allows nominal terminal band with stressed operational classification', () => {
    const decision = deriveOperationalDecisionState({
      gi: 0.81,
      tripwire_active: true,
      tripwire_level: 'elevated',
      kv_continuity_ok: true,
      degraded_agent_count: 3,
      gi_degraded: false,
    });
    assert.equal(decision.display_state, 'green');
    assert.equal(decision.terminal_status, 'nominal');
    assert.equal(decision.operational_classification, 'STRESSED');
    assert.equal(decision.tripwire_state, 'elevated');
  });

  it('marks stale persisted GI as degraded freshness class', () => {
    const rep = buildGiRepresentation({
      value: 0.771,
      computation_source: 'kv-carry',
      persistence_source: 'cached',
      computed_at: null,
      persisted_at: '2026-08-17T10:00:00.000Z',
      cache_age_seconds: 900,
      degraded: true,
      stored_mode: 'yellow',
      derived_mode: getGiMode(0.771),
    });
    assert.equal(rep.freshness_class, 'degraded');
  });

  it('leaves persisted_at null for unpersisted live-compute without KV', () => {
    assert.equal(
      resolvePersistedAtForSource({
        computation_source: 'live-compute',
        persisted_timestamp: '2026-08-17T12:00:00.000Z',
        kv_available: false,
      }),
      null,
    );
    assert.equal(
      resolvePersistedAtForSource({
        computation_source: 'gic-indexer',
        persisted_timestamp: '2026-08-17T12:00:00.000Z',
        kv_available: true,
      }),
      null,
    );
    assert.equal(
      resolvePersistedAtForSource({
        computation_source: 'kv-live',
        persisted_timestamp: '2026-08-17T12:00:00.000Z',
        kv_available: true,
      }),
      '2026-08-17T12:00:00.000Z',
    );
  });

  it('preserves live instrument failure metadata on micro representation', () => {
    const rep = buildGiRepresentation({
      value: 0.881,
      computation_source: 'live-compute',
      persistence_source: 'live',
      computed_at: '2026-08-17T12:04:35.000Z',
      persisted_at: null,
      cache_age_seconds: 0,
      degraded: false,
      stored_mode: null,
      derived_mode: getGiMode(0.881),
      instrument_count: 40,
      failed_instrument_count: 2,
      degraded_instrument_count: 5,
      sample_window: 'signals:micro:registry:40',
    });
    assert.equal(rep.failed_instrument_count, 2);
    assert.equal(rep.instrument_count, 40);
    assert.equal(rep.computation_source, 'live-compute');
  });
  it('marks micro STRESSED when instruments fail even if agents appear healthy', () => {
    const live = buildMicroLiveProvenance({
      gi: 0.881,
      instruments: [{ source: 'error' }],
      agents: [{ healthy: true }],
      allSignals: [{ severity: 'elevated' }],
      failedInstruments: [{ id: 'gaia-usgs-water' }],
      generatedAtIso: '2026-08-17T12:04:35.000Z',
      instrumentCount: 40,
      fallbacksUsed: 0,
    });
    assert.equal(live.decision_state?.operational_classification, 'STRESSED');
    assert.match(live.decision_state?.decision_summary ?? '', /failed/);
  });
});

describe('C-406 integrity enrichment', () => {
  const chain: GiChainResolution = {
    gi: 0.81,
    mode: 'green',
    terminal_status: 'nominal',
    primary_driver: 'test',
    source: 'kv-live',
    source_legacy: 'kv',
    timestamp: '2026-08-17T11:00:00.000Z',
    age_seconds: 600,
    verified: false,
    degraded: false,
    raw_integrity: null,
    gi_floored: false,
    kv: null,
  };
  const payload = {
    global_integrity: 0.81,
    mode: 'yellow',
    terminal_status: 'stressed',
    timestamp: '2026-08-17T11:00:00.000Z',
    source: 'kv',
    kv: true,
  } as IntegrityPayload;
  const tripwire: RuntimeTripwireState = {
    active: false,
    level: 'none',
    reason: 'test',
    last_updated: '2026-08-17T12:00:00.000Z',
  };

  it('uses chain timestamp for storage-backed computed_at', () => {
    const enrichment = buildIntegrityEnrichment({
      finalGi: 0.81,
      computationSource: 'kv-live',
      persistenceSource: 'kv',
      chain,
      payload,
      kvKeyHealth: null,
      tripwire,
      degradedAgentCount: null,
      giDegraded: false,
      storedMode: 'yellow',
    });
    assert.equal(enrichment.gi_representation.computed_at, '2026-08-17T11:00:00.000Z');
    assert.equal(enrichment.gi_representation.cache_age_seconds, 600);
    assert.equal(enrichment.mode, getGiMode(0.81));
    assert.equal(enrichment.decision_state.display_state, getGiMode(0.81));
  });

  it('uses fresh age for gic-indexer enrichment', () => {
    const enrichment = buildIntegrityEnrichment({
      finalGi: 0.85,
      computationSource: 'gic-indexer',
      persistenceSource: 'gic-indexer',
      chain,
      payload,
      kvKeyHealth: null,
      tripwire,
      degradedAgentCount: null,
      giDegraded: false,
      storedMode: null,
      computedAt: '2026-08-17T12:04:35.000Z',
      cacheAgeSeconds: 0,
    });
    assert.equal(enrichment.gi_representation.computed_at, '2026-08-17T12:04:35.000Z');
    assert.equal(enrichment.gi_representation.cache_age_seconds, 0);
    assert.equal(enrichment.gi_representation.freshness_class, 'fresh');
  });
});

describe('C-406 KV key semantics', () => {
  it('defines required continuity keys matching seed route minimum', () => {
    assert.deepEqual(KV_CONTINUITY_REQUIRED_KEY_NAMES, [
      'GI_STATE',
      'HEARTBEAT',
      'LAST_INGEST',
    ]);
    assert.deepEqual(KV_CONTINUITY_KEY_NAMES, [
      'GI_STATE',
      'HEARTBEAT',
      'LAST_INGEST',
      'SIGNAL_SNAPSHOT',
    ]);
  });

  it('treats LEDGER_CIRCUIT_OPEN as inverted absence-ok', () => {
    assert.equal(KV_INVERTED_ABSENCE_OK.has('LEDGER_CIRCUIT_OPEN'), true);
  });
});

describe('C-406 quorum receipt vs seal authority', () => {
  it('5/5 received + disputed verification is receipt only — not seal completion', () => {
    const authority = deriveQuorumAuthoritySemantics(baseQuorum(), {
      verification_status: 'disputed',
      candidates_reviewed: 0,
      tripwire_active: true,
    });
    assert.equal(authority.quorum_receipt_status, 'received');
    assert.equal(authority.seal_status, 'receipt_quorum_only');
    assert.equal(authority.seal_eligibility, 'blocked');
    assert.equal(authority.execution_authorized, false);
    assert.match(authority.receipt_note, /receipt quorum only/);
    assert.doesNotMatch(authority.receipt_note, /seal complete/i);
  });

  it('5/5 received + active tripwire blocks seal eligibility', () => {
    const authority = deriveQuorumAuthoritySemantics(baseQuorum(), {
      verification_status: 'verified',
      candidates_reviewed: 0,
      tripwire_active: true,
    });
    assert.equal(authority.seal_eligibility, 'blocked');
    assert.equal(authority.execution_authorized, false);
  });

  it('5/5 received + zero candidates keeps adjudication none', () => {
    const authority = deriveQuorumAuthoritySemantics(baseQuorum(), {
      verification_status: 'verified',
      candidates_reviewed: 0,
    });
    assert.equal(authority.adjudication_status, 'none');
    assert.equal(authority.candidates_reviewed, 0);
  });

  it('incomplete quorum remains pending receipt', () => {
    const authority = deriveQuorumAuthoritySemantics(
      baseQuorum({
        attestations_received: 3,
        status: 'in_progress',
        completed_at: null,
      }),
    );
    assert.equal(authority.quorum_receipt_status, 'in_progress');
    assert.equal(authority.seal_status, 'not_eligible');
  });
});
