// C-412: World Renderer instruments facade — contract tests
// Run: tsx tests/contract/worldInstrumentsFacade.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deriveInstrumentsAlerts } from '@/lib/instruments/deriveAlerts';
import { MOBIUS_INSTRUMENTS_SCHEMA_VERSION } from '@/lib/instruments/types';
import { computeConsensus } from '@/lib/epicon/consensus';
import type { EpiconAgentReport } from '@/lib/epicon/types';
import {
  isObservationAccepted,
  parseObservationReports,
} from '@/lib/instruments/parseObservationReports';

describe('C-412 instruments facade', () => {
  it('schema version constant is MOBIUS_INSTRUMENTS_1', () => {
    assert.equal(MOBIUS_INSTRUMENTS_SCHEMA_VERSION, 'MOBIUS_INSTRUMENTS_1');
  });

  it('deriveInstrumentsAlerts surfaces KV continuity and failed instruments', () => {
    const alerts = deriveInstrumentsAlerts({
      kvContinuityOk: false,
      failedInstruments: [{ id: 'gaia-usgs', agent: 'GAIA', error: 'timeout' }],
      lanes: { kv: { ok: false } },
    });
    assert.ok(alerts.some((a) => a.message.includes('KV continuity')));
    assert.ok(alerts.some((a) => a.message.includes('gaia-usgs')));
  });

  it('deriveInstrumentsAlerts does not invent alerts when sources are healthy', () => {
    const alerts = deriveInstrumentsAlerts({
      kvContinuityOk: true,
      lanes: { kv: { ok: true, freshness: 'fresh' }, integrity: { ok: true, freshness: 'nominal' } },
      failedInstruments: [],
    });
    assert.equal(alerts.length, 0);
  });

  it('parseObservationReports rejects duplicate agents', () => {
    const result = parseObservationReports([
      {
        agent: 'ATLAS',
        stance: 'support',
        confidence: 0.9,
        ej: { reasoning: 'a', anchors: [], counterfactuals: [], ccr_score: 1, css_pass: true },
        ej_hash: 'h',
        generated_at: '2026-08-26T00:00:00.000Z',
      },
      {
        agent: 'ATLAS',
        stance: 'support',
        confidence: 0.9,
        ej: { reasoning: 'b', anchors: [], counterfactuals: [], ccr_score: 1, css_pass: true },
        ej_hash: 'h2',
        generated_at: '2026-08-26T00:00:00.000Z',
      },
    ]);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, 'duplicate_agent');
  });

  it('parseObservationReports rejects unknown agent ids', () => {
    const result = parseObservationReports([
      {
        agent: 'FAKE',
        stance: 'support',
        confidence: 0.9,
        ej: { reasoning: 'a', anchors: [], counterfactuals: [], ccr_score: 1, css_pass: true },
        ej_hash: 'h',
        generated_at: '2026-08-26T00:00:00.000Z',
      },
    ]);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, 'invalid_agent');
  });

  it('isObservationAccepted requires independent quorum even when ECS passes', () => {
    const singleReport: EpiconAgentReport[] = [
      {
        agent: 'ATLAS',
        stance: 'support',
        confidence: 0.95,
        ej: { reasoning: 'ok', anchors: ['a'], counterfactuals: [], ccr_score: 1, css_pass: true },
        ej_hash: 'h1',
        generated_at: '2026-08-26T00:00:00.000Z',
      },
    ];
    const consensus = computeConsensus(singleReport);
    assert.equal(consensus.status, 'pass');
    assert.equal(consensus.quorum.independent_ok, false);
    assert.equal(isObservationAccepted(consensus), false);
  });

  it('isObservationAccepted true with five distinct support reports', () => {
    const reports: EpiconAgentReport[] = [
      {
        agent: 'ATLAS',
        stance: 'support',
        confidence: 0.95,
        ej: { reasoning: 'ok', anchors: ['a'], counterfactuals: [], ccr_score: 1, css_pass: true },
        ej_hash: 'h1',
        generated_at: '2026-08-26T00:00:00.000Z',
      },
      {
        agent: 'ZEUS',
        stance: 'support',
        confidence: 0.94,
        ej: { reasoning: 'ok', anchors: ['a'], counterfactuals: [], ccr_score: 1, css_pass: true },
        ej_hash: 'h2',
        generated_at: '2026-08-26T00:00:00.000Z',
      },
      {
        agent: 'EVE',
        stance: 'support',
        confidence: 0.9,
        ej: { reasoning: 'ok', anchors: ['a'], counterfactuals: [], ccr_score: 1, css_pass: true },
        ej_hash: 'h3',
        generated_at: '2026-08-26T00:00:00.000Z',
      },
      {
        agent: 'JADE',
        stance: 'support',
        confidence: 0.92,
        ej: { reasoning: 'ok', anchors: ['a'], counterfactuals: [], ccr_score: 1, css_pass: true },
        ej_hash: 'h4',
        generated_at: '2026-08-26T00:00:00.000Z',
      },
      {
        agent: 'AUREA',
        stance: 'support',
        confidence: 0.91,
        ej: { reasoning: 'ok', anchors: ['a'], counterfactuals: [], ccr_score: 1, css_pass: true },
        ej_hash: 'h5',
        generated_at: '2026-08-26T00:00:00.000Z',
      },
    ];
    const consensus = computeConsensus(reports);
    assert.equal(isObservationAccepted(consensus), true);
  });
});
