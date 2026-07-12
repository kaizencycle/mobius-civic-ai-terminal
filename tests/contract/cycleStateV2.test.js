// C-370: MOBIUS_CYCLE_STATE_V2 writer — explicit hot/cold field bindings.
// Run: node scripts/mesh/write-cycle-state.js tests/fixtures/cycle-state-v2/snapshot.json tests/fixtures/cycle-state-v2/vault.json tests/fixtures/cycle-state-v2/manifest.json && node --test tests/contract/cycleStateV2.test.js

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const FIXTURE = join(ROOT, 'tests', 'fixtures', 'cycle-state-v2');
const OUT = join(ROOT, 'tests', 'fixtures', 'cycle-state-v2', 'output.json');

describe('cycle-state V2', () => {
  it('writes MOBIUS_CYCLE_STATE_V2 with hot/cold bindings', () => {
    execSync(
      `node scripts/mesh/write-cycle-state.js ${join(FIXTURE, 'snapshot.json')} ${join(FIXTURE, 'vault.json')} ${join(FIXTURE, 'manifest.json')}`,
      { cwd: ROOT, stdio: 'pipe', env: { ...process.env, CYCLE_STATE_OUT: OUT } },
    );
    assert.ok(existsSync(OUT));
    const state = JSON.parse(readFileSync(OUT, 'utf8'));
    assert.strictEqual(state.schema, 'MOBIUS_CYCLE_STATE_V2');
    assert.strictEqual(state.hot.seals_raw, 354);
    assert.strictEqual(state.cold.manifest_blocks, 194);
    assert.strictEqual(state.cold.gap_raw_vs_cold, 160);
    assert.strictEqual(state.hot.chain_tip.sequence, 29);
    assert.ok(state.open_gates.includes('cold_canon_append_pending'));
    assert.ok(state.counting_rules.seals_raw.includes('block_number'));
  });
});
