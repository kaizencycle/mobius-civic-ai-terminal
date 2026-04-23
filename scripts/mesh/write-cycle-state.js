#!/usr/bin/env node
/**
 * C-288 — Build `ledger/cycle-state.json` from a fetched Terminal snapshot-lite (or full snapshot) JSON.
 * Usage: node scripts/mesh/write-cycle-state.js <path-to-snapshot.json>
 * Env: SNAPSHOT_FILE (default: snapshot.json)
 */

const fs = require('node:fs');
const path = require('node:path');

const inPath = process.argv[2] || process.env.SNAPSHOT_FILE || 'snapshot.json';
if (!fs.existsSync(inPath)) {
  console.error(`Input not found: ${inPath}`);
  process.exit(1);
}
let snap;
try {
  const raw = fs.readFileSync(inPath, 'utf8');
  snap = JSON.parse(raw);
} catch (e) {
  console.error('Failed to read or parse snapshot JSON:', e instanceof Error ? e.message : e);
  process.exit(1);
}
if (!snap || typeof snap !== 'object') {
  console.error('Snapshot must be a JSON object');
  process.exit(1);
}

const cycle =
  (typeof snap.cycle === 'string' && snap.cycle.trim() ? snap.cycle.trim() : null) ??
  (snap.lanes && typeof snap.lanes === 'object' && snap.lanes.echo && typeof snap.lanes.echo.cycle === 'string'
    ? snap.lanes.echo.cycle
    : null) ??
  'unknown';

const memoryMode =
  snap.memory_mode && typeof snap.memory_mode === 'object'
    ? {
        degraded: Boolean(snap.memory_mode.degraded),
        gi_provenance: snap.memory_mode.gi_provenance ?? null,
        gi_verified: Boolean(snap.memory_mode.gi_verified),
        gi_value: typeof snap.memory_mode.gi_value === 'number' ? snap.memory_mode.gi_value : null,
        lite_ok: snap.memory_mode.lite_ok !== false,
      }
    : null;

const out = {
  schema: 'MOBIUS_CYCLE_STATE_V1',
  node_id: 'mobius-terminal',
  source: snap.lite === true ? 'snapshot-lite' : 'snapshot',
  cycle,
  fetched_at: new Date().toISOString(),
  gi: typeof snap.gi === 'number' && Number.isFinite(snap.gi) ? snap.gi : null,
  mode: typeof snap.mode === 'string' ? snap.mode : null,
  degraded: Boolean(snap.degraded),
  gi_provenance: typeof snap.gi_provenance === 'string' ? snap.gi_provenance : null,
  gi_verified: Boolean(snap.gi_verified),
  memory_mode: memoryMode,
  deployment: snap.deployment && typeof snap.deployment === 'object' ? snap.deployment : null,
  snapshot_meta:
    snap.meta && typeof snap.meta === 'object'
      ? { total_ms: snap.meta.total_ms ?? null, lane_ms: snap.meta.lane_ms ?? null }
      : null,
};

const outDir = path.join(process.cwd(), 'ledger');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'cycle-state.json');
fs.writeFileSync(outFile, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
console.log(`Wrote ${outFile} (cycle=${cycle})`);
