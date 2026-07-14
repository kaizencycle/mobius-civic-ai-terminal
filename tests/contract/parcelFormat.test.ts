// C-372: journal parcel hash determinism (MEC discipline).
// Run: tsx tests/contract/parcelFormat.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  GENESIS_PARCEL_HASH,
  buildParcelFile,
  canonicalStringify,
  parcelEntryLine,
  parcelEntryObject,
  verifyParcelFileContent,
} from '../../scripts/lib/parcel-format.mjs';

describe('parcelFormat', () => {
  const baseEntry = {
    id: 'journal-HERMES-C-372-001',
    agent: 'HERMES',
    cycle: 'C-372',
    timestamp: '2026-07-14T12:00:00.000Z',
    scope: 'routing',
    observation: 'Unicode test: café naïve 日本語',
    inference: 'Deterministic ordering check.',
    recommendation: 'Flush to cold canon.',
    confidence: 0.864,
    derivedFrom: ['b', 'a'],
    relatedAgents: ['ZEUS'],
    status: 'committed',
    category: 'observation',
    severity: 'nominal',
    source: 'agent-journal',
    agentOrigin: 'HERMES',
    tags: ['cron'],
  };

  it('canonicalStringify sorts keys deterministically', () => {
    const a = canonicalStringify({ z: 1, a: 2, m: 3 });
    const b = canonicalStringify({ m: 3, a: 2, z: 1 });
    assert.strictEqual(a, b);
    assert.strictEqual(a, '{"a":2,"m":3,"z":1}');
  });

  it('parcelEntryObject renames confidence to witness_confidence and omits gi', () => {
    const obj = parcelEntryObject({ ...baseEntry, gi: 0.9 });
    assert.strictEqual(obj.witness_confidence, 0.864);
    assert.strictEqual('confidence' in obj, false);
    assert.strictEqual('gi' in obj, false);
  });

  it('parcelEntryLine is stable across key reordering in input', () => {
    const shuffled = {
      recommendation: baseEntry.recommendation,
      id: baseEntry.id,
      confidence: baseEntry.confidence,
      agent: baseEntry.agent,
      inference: baseEntry.inference,
      observation: baseEntry.observation,
      cycle: baseEntry.cycle,
      timestamp: baseEntry.timestamp,
      scope: baseEntry.scope,
      derivedFrom: baseEntry.derivedFrom,
      relatedAgents: baseEntry.relatedAgents,
      status: baseEntry.status,
      category: baseEntry.category,
      severity: baseEntry.severity,
      source: baseEntry.source,
      agentOrigin: baseEntry.agentOrigin,
      tags: baseEntry.tags,
    };
    assert.strictEqual(parcelEntryLine(baseEntry), parcelEntryLine(shuffled));
  });

  it('parcelEntryLine handles empty optional fields', () => {
    const minimal = {
      id: 'x',
      agent: 'ATLAS',
      cycle: 'C-372',
      timestamp: '2026-07-14T00:00:00.000Z',
      scope: 's',
      observation: 'o',
      inference: 'i',
      recommendation: 'r',
      confidence: 0.5,
      derivedFrom: [],
      relatedAgents: [],
      status: 'committed',
      category: 'observation',
      severity: 'nominal',
      source: 'agent-journal',
      agentOrigin: 'ATLAS',
    };
    const line = parcelEntryLine(minimal);
    assert.ok(line.includes('"witness_confidence":0.5'));
    const parsed = JSON.parse(line);
    assert.strictEqual(parsed.tags, undefined);
  });

  it('buildParcelFile produces verifiable hash chain with genesis prev', () => {
    const built = buildParcelFile({
      cycle: 'C-372',
      seal_id: 'seal-C-372-001',
      seal_hash: 'a'.repeat(64),
      gi_at_seal: 0.88,
      entry_count: 1,
      prev_parcel_hash: GENESIS_PARCEL_HASH,
      created_at: '2026-07-14T12:00:00.000Z',
      attestations: {
        ATLAS: { verdict: 'pass', rationale: 'R-001' },
      },
      entries: [baseEntry],
    });

    const verdict = verifyParcelFileContent(built.fileText);
    assert.strictEqual(verdict.ok, true);
    assert.strictEqual(verdict.parcelHash, built.parcelHash);
    assert.strictEqual(verdict.prevParcelHash, GENESIS_PARCEL_HASH);
  });

  it('verifyParcelFileContent rejects corrupted footer hash', () => {
    const built = buildParcelFile({
      cycle: 'C-372',
      seal_id: 'seal-C-372-002',
      seal_hash: 'b'.repeat(64),
      gi_at_seal: 0.9,
      entry_count: 1,
      prev_parcel_hash: GENESIS_PARCEL_HASH,
      created_at: '2026-07-14T12:00:00.000Z',
      entries: [baseEntry],
    });
    const corrupted = built.fileText.replace(built.parcelHash, 'f'.repeat(64));
    const verdict = verifyParcelFileContent(corrupted);
    assert.strictEqual(verdict.ok, false);
    assert.ok(verdict.error?.includes('parcel_hash mismatch'));
  });

  it('second parcel chains prev_parcel_hash to first footer', () => {
    const first = buildParcelFile({
      cycle: 'C-372',
      seal_id: 'seal-C-372-001',
      seal_hash: 'c'.repeat(64),
      gi_at_seal: 0.88,
      entry_count: 1,
      prev_parcel_hash: GENESIS_PARCEL_HASH,
      created_at: '2026-07-14T12:00:00.000Z',
      entries: [baseEntry],
    });
    const second = buildParcelFile({
      cycle: 'C-372',
      seal_id: 'seal-C-372-002',
      seal_hash: 'd'.repeat(64),
      gi_at_seal: 0.89,
      entry_count: 1,
      prev_parcel_hash: first.parcelHash,
      created_at: '2026-07-14T13:00:00.000Z',
      entries: [{ ...baseEntry, id: 'journal-HERMES-C-372-002' }],
    });
    assert.strictEqual(second.header.prev_parcel_hash, first.parcelHash);
    assert.strictEqual(verifyParcelFileContent(second.fileText).ok, true);
  });
});
