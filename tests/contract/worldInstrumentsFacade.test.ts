// C-412: World Renderer instruments facade — contract tests
// Run: tsx tests/contract/worldInstrumentsFacade.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deriveInstrumentsAlerts } from '@/lib/instruments/deriveAlerts';
import { MOBIUS_INSTRUMENTS_SCHEMA_VERSION } from '@/lib/instruments/types';
import { computeConsensus } from '@/lib/epicon/consensus';
import type { EpiconAgentReport } from '@/lib/epicon/types';

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

  it('verify-observation consensus pass requires ECS threshold without oppose votes', () => {
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
    assert.equal(consensus.status, 'pass');
    assert.ok(consensus.ecs >= 0.8);
  });
});
