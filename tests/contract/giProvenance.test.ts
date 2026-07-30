// C-388: GI fallback must not render as a live measurement in journal text.
// Run: tsx tests/contract/giProvenance.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  GI_HEURISTIC_DEFAULT,
  GI_UNAVAILABLE_LABEL,
  giLabel,
  parseGiField,
  resolveGiProvenanceFromBody,
} from '../../lib/gi/provenance';
import {
  parseAtlasObserveBody,
  parseZeusCronBody,
} from '../../lib/agents/sentinel-cycle-journals';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function readRepoFile(rel: string): string {
  return readFileSync(join(repoRoot, rel), 'utf8');
}

describe('GI provenance (C-388)', () => {
  it('giLabel distinguishes live vs unavailable', () => {
    assert.equal(giLabel(0.63, true), '0.63');
    assert.equal(giLabel(GI_HEURISTIC_DEFAULT, false), GI_UNAVAILABLE_LABEL);
  });

  it('parseGiField marks missing gi as not live', () => {
    const missing = parseGiField(undefined);
    assert.equal(missing.gi, GI_HEURISTIC_DEFAULT);
    assert.equal(missing.giIsLive, false);

    const live = parseGiField(0.63);
    assert.equal(live.gi, 0.63);
    assert.equal(live.giIsLive, true);
  });

  it('parseAtlasObserveBody respects explicit giIsLive flag', () => {
    const fallback = parseAtlasObserveBody({ cycle: 'C-388', gi: 0.74, giIsLive: false, source: 'cron' });
    assert.ok(fallback);
    assert.equal(fallback!.giIsLive, false);

    const live = parseAtlasObserveBody({ cycle: 'C-388', gi: 0.63, source: 'cron' });
    assert.ok(live);
    assert.equal(live!.giIsLive, true);

    const falseUpgrade = parseAtlasObserveBody({ cycle: 'C-388', giIsLive: true, source: 'cron' });
    assert.ok(falseUpgrade);
    assert.equal(falseUpgrade!.giIsLive, false);
    assert.equal(falseUpgrade!.gi, GI_HEURISTIC_DEFAULT);
  });

  it('resolveGiProvenanceFromBody cannot upgrade absent gi via flag', () => {
    const resolved = resolveGiProvenanceFromBody({ giIsLive: true });
    assert.equal(resolved.giIsLive, false);
    assert.equal(resolved.gi, GI_HEURISTIC_DEFAULT);
  });

  it('parseZeusCronBody mirrors atlas gi provenance', () => {
    const parsed = parseZeusCronBody({ cycle: 'C-388', source: 'cron' });
    assert.ok(parsed);
    assert.equal(parsed!.giIsLive, false);
  });

  it('cycle-synthesize resolves heartbeat GI from KV when trace missing', () => {
    const src = readRepoFile('app/api/eve/cycle-synthesize/route.ts');
    assert.match(src, /resolveLiveGiForHeartbeat/);
    assert.match(src, /skipping heartbeat GI write/);
    assert.doesNotMatch(src, /writeSynthesisCronHeartbeatKv\(giHb \?\? 0\.74/);
  });

  it('appendAtlasCronJournal does not duplicate journal lane write', () => {
    const src = readRepoFile('lib/agents/sentinel-cycle-journals.ts');
    assert.doesNotMatch(src, /appendJournalLaneEntry/);
  });

  it('mii feed accepts fallback provenance rows', () => {
    const src = readRepoFile('lib/kv/mii.ts');
    assert.match(src, /v\.source === 'live' \|\| v\.source === 'fallback'/);
    assert.match(src, /provenanceUpgrade/);
  });

  it('sentinel journals use giLabel in ATLAS and ZEUS observation text', () => {
    const src = readRepoFile('lib/agents/sentinel-cycle-journals.ts');
    assert.match(src, /GI=\$\{giLabel\(gi, input\.giIsLive\)\}/);
    assert.match(src, /giIsLive: boolean/);
  });
});
