// C-370: MOBIUS_CYCLE_STATE_V2 writer — explicit hot/cold field bindings.
// Run: tsx tests/contract/cycleStateV2.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const FIXTURE = join(ROOT, 'tests', 'fixtures', 'cycle-state-v2');

function runWriter(
  snapshotPath: string,
  vaultPath: string | null,
  manifestPath: string | null,
  outPath: string,
) {
  const args = [snapshotPath];
  if (vaultPath) args.push(vaultPath);
  if (manifestPath) args.push(manifestPath);
  execSync(`node scripts/mesh/write-cycle-state.js ${args.join(' ')}`, {
    cwd: ROOT,
    stdio: 'pipe',
    env: { ...process.env, CYCLE_STATE_OUT: outPath },
  });
  return JSON.parse(readFileSync(outPath, 'utf8')) as Record<string, unknown>;
}

describe('cycle-state V2', () => {
  it('writes MOBIUS_CYCLE_STATE_V2 with hot/cold bindings', () => {
    const out = join(FIXTURE, 'output.json');
    const state = runWriter(
      join(FIXTURE, 'snapshot.json'),
      join(FIXTURE, 'vault.json'),
      join(FIXTURE, 'manifest.json'),
      out,
    );
    assert.strictEqual(state.schema, 'MOBIUS_CYCLE_STATE_V2');
    assert.strictEqual((state.hot as { seals_raw: number }).seals_raw, 354);
    assert.strictEqual((state.cold as { manifest_blocks: number }).manifest_blocks, 194);
    assert.strictEqual((state.cold as { gap_raw_vs_cold: number }).gap_raw_vs_cold, 160);
    assert.strictEqual((state.hot as { chain_tip: { sequence: number } }).chain_tip.sequence, 29);
    assert.ok((state.open_gates as string[]).includes('cold_canon_append_pending'));
    assert.ok(
      (state.counting_rules as { seals_raw: string }).seals_raw.includes('block_number'),
    );
  });

  it('surfaces workflow vault fallback {"ok":false} as vault_fetch_failed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cycle-state-v2-'));
    const vaultPath = join(dir, 'vault-status.json');
    const outPath = join(dir, 'out.json');
    writeFileSync(vaultPath, '{"ok":false}\n', 'utf8');

    const state = runWriter(join(FIXTURE, 'snapshot.json'), vaultPath, join(FIXTURE, 'manifest.json'), outPath);

    assert.strictEqual(state.hot, null);
    assert.strictEqual((state.cold as { source: string }).source, 'Mobius-Substrate/canon/reserve-blocks/MANIFEST.json');
    assert.ok((state.open_gates as string[]).includes('vault_fetch_failed'));
    assert.ok(!(state.open_gates as string[]).includes('manifest_fetch_failed'));
  });

  it('surfaces workflow manifest fallback {} as manifest_fetch_failed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cycle-state-v2-'));
    const manifestPath = join(dir, 'manifest.json');
    const outPath = join(dir, 'out.json');
    writeFileSync(manifestPath, '{}\n', 'utf8');

    const state = runWriter(join(FIXTURE, 'snapshot.json'), join(FIXTURE, 'vault.json'), manifestPath, outPath);

    assert.strictEqual((state.cold as { source: string }).source, 'manifest_fetch_failed');
    assert.strictEqual((state.cold as { manifest_blocks: number | null }).manifest_blocks, null);
    assert.ok((state.open_gates as string[]).includes('manifest_fetch_failed'));
    assert.ok(!(state.open_gates as string[]).includes('cold_canon_append_pending'));
  });
});
