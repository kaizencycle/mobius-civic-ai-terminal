#!/usr/bin/env node
/**
 * C-288 / C-370 — Build `ledger/cycle-state.json` from live Terminal + cold canon inputs.
 *
 * Usage:
 *   node scripts/mesh/write-cycle-state.js <snapshot-lite.json> [vault-status.json] [manifest.json]
 *
 * Env:
 *   SNAPSHOT_FILE, VAULT_STATUS_FILE, MANIFEST_FILE — input paths
 *   SUBSTRATE_MANIFEST_URL — recorded in output cold.manifest_url
 *   SUBSTRATE_REPO_SHA — optional pin for repos.substrate.sha (else from manifest meta if present)
 */

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_MANIFEST_URL =
  'https://raw.githubusercontent.com/kaizencycle/Mobius-Substrate/main/canon/reserve-blocks/MANIFEST.json';

function readJson(filePath, label) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      console.warn(`[write-cycle-state] ${label} is not an object — skipping`);
      return null;
    }
    return parsed;
  } catch (err) {
    console.warn(`[write-cycle-state] failed to read ${label}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

function parseSealTip(sealId) {
  if (typeof sealId !== 'string' || sealId.length === 0) return null;
  const match = sealId.match(/seal-(C-\d+)-(\d+)/i);
  if (!match) return { seal_id: sealId, cycle: null, sequence: null };
  return {
    seal_id: sealId,
    cycle: match[1],
    sequence: Number.parseInt(match[2], 10),
  };
}

function deriveOpenGates({ vault, cold, snap }) {
  const gates = [];
  if (cold && cold.gap_raw_vs_cold > 0) {
    gates.push('cold_canon_append_pending');
  }
  if (vault && vault.sustain_cycles_met === false) {
    gates.push('sustain_not_wired');
  }
  if (vault && typeof vault.gi_current === 'number' && vault.gi_current < 0.95) {
    gates.push('fountain_gi_below_threshold');
  }
  if (snap && snap.degraded === true) {
    gates.push('terminal_degraded');
  }
  if (vault && vault.substrate_ok === false) {
    gates.push('substrate_attestation_gap');
  }
  return gates;
}

const snapPath = process.argv[2] || process.env.SNAPSHOT_FILE || 'snapshot.json';
if (!fs.existsSync(snapPath)) {
  console.error(`Input not found: ${snapPath}`);
  process.exit(1);
}

const snap = readJson(snapPath, 'snapshot-lite');
if (!snap) {
  console.error('snapshot-lite input required');
  process.exit(1);
}

const vaultPath = process.argv[3] || process.env.VAULT_STATUS_FILE || 'vault-status.json';
const manifestPath = process.argv[4] || process.env.MANIFEST_FILE || 'manifest.json';
const vault = readJson(vaultPath, 'vault-status');
const manifest = readJson(manifestPath, 'manifest');

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
        gi_source: typeof snap.memory_mode.gi_source === 'string' ? snap.memory_mode.gi_source : null,
        lite_ok: snap.memory_mode.lite_ok !== false,
      }
    : null;

const snapshotSchemaVersion =
  typeof snap.schema_version === 'string' && snap.schema_version.trim() ? snap.schema_version.trim() : null;

const sealsRaw =
  vault?.reserve_blocks_sealed ??
  vault?.seals_count ??
  vault?.reserve_block?.sealed_blocks ??
  null;

const chainTip = parseSealTip(vault?.latest_seal_id ?? null);

const manifestUrl = process.env.SUBSTRATE_MANIFEST_URL ?? DEFAULT_MANIFEST_URL;
const coldBlocks = typeof manifest?.total_blocks === 'number' ? manifest.total_blocks : null;
const coldMic = typeof manifest?.total_mic === 'number' ? manifest.total_mic : manifest?.total_mic_units ?? null;
const gapRawVsCold =
  typeof sealsRaw === 'number' && typeof coldBlocks === 'number'
    ? Math.max(0, sealsRaw - coldBlocks)
    : null;

const giReadings = {
  snapshot_lite:
    typeof snap.gi === 'number' && Number.isFinite(snap.gi)
      ? { value: snap.gi, field: 'gi', source: 'snapshot-lite' }
      : null,
  memory_mode:
    memoryMode?.gi_value != null
      ? { value: memoryMode.gi_value, field: 'memory_mode.gi_value', source: memoryMode.gi_source ?? 'snapshot-lite' }
      : null,
  vault_dashboard:
    typeof vault?.gi_current === 'number'
      ? { value: vault.gi_current, field: 'gi_current', source: '/api/vault/status' }
      : null,
};

const openGates = deriveOpenGates({ vault, cold: { gap_raw_vs_cold: gapRawVsCold }, snap });

const out = {
  schema: 'MOBIUS_CYCLE_STATE_V2',
  node_id: 'mobius-terminal',
  source: snap.lite === true ? 'snapshot-lite+vault+manifest' : 'snapshot+vault+manifest',
  snapshot_schema_version: snapshotSchemaVersion,
  cycle,
  as_of: new Date().toISOString(),
  fetched_at: new Date().toISOString(),
  gi: typeof snap.gi === 'number' && Number.isFinite(snap.gi) ? snap.gi : null,
  mode: typeof snap.mode === 'string' ? snap.mode : null,
  degraded: Boolean(snap.degraded),
  gi_provenance: typeof snap.gi_provenance === 'string' ? snap.gi_provenance : null,
  gi_verified: Boolean(snap.gi_verified),
  gi_readings: giReadings,
  memory_mode: memoryMode,
  deployment: snap.deployment && typeof snap.deployment === 'object' ? snap.deployment : null,
  snapshot_meta:
    snap.meta && typeof snap.meta === 'object'
      ? { total_ms: snap.meta.total_ms ?? null, lane_ms: snap.meta.lane_ms ?? null }
      : null,
  counting_rules: {
    seals_raw:
      'Attested seal records in KV index (reserve_blocks_sealed / seals_count). May include duplicate block_number eras.',
    seals_unique_block_number:
      'Distinct block_number chain slots — cold canon unit of account. Requires KV collision audit; not computed in public workflow.',
    gap_raw_vs_cold:
      'seals_raw minus manifest.total_blocks — upper-bound gap; true append gap uses deduped unique count.',
  },
  hot: vault
    ? {
        seals_raw: sealsRaw,
        seals_unique_block_number: null,
        chain_tip: chainTip,
        in_progress_mic: vault.in_progress_balance ?? vault.reserve_block?.in_progress_balance ?? null,
        in_progress_block: vault.reserve_block_in_progress ?? vault.reserve_block?.in_progress_block ?? null,
        fountain_status: vault.fountain_status ?? null,
        sustain_cycles_met: vault.sustain_cycles_met ?? null,
        substrate_ok: vault.substrate_ok ?? null,
        source: '/api/vault/status',
      }
    : null,
  cold: manifest
    ? {
        manifest_blocks: coldBlocks,
        manifest_mic: coldMic,
        chain_tip_hash: manifest.chain_tip_hash ?? null,
        manifest_url: manifestUrl,
        gap_raw_vs_cold: gapRawVsCold,
        source: 'Mobius-Substrate/canon/reserve-blocks/MANIFEST.json',
      }
    : manifestPresentFallback(manifestUrl),
  repos: {
    terminal: snap.deployment?.commit_sha
      ? { sha: snap.deployment.commit_sha, branch: 'main', source: 'snapshot-lite.deployment' }
      : null,
    substrate: {
      sha: process.env.SUBSTRATE_REPO_SHA ?? null,
      branch: 'main',
      manifest_ref: manifestUrl,
      manifest_generated_at: manifest?.generated_at ?? null,
      source: process.env.SUBSTRATE_REPO_SHA ? 'env' : 'manifest',
    },
  },
  open_gates: openGates,
};

function manifestPresentFallback(url) {
  return {
    manifest_blocks: null,
    manifest_mic: null,
    chain_tip_hash: null,
    manifest_url: url,
    gap_raw_vs_cold: null,
    source: 'manifest_fetch_failed',
  };
}

const outDir = path.join(process.cwd(), 'ledger');
fs.mkdirSync(outDir, { recursive: true });
const outFile = process.env.CYCLE_STATE_OUT || path.join(outDir, 'cycle-state.json');
fs.writeFileSync(outFile, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
console.log(`Wrote ${outFile} (schema=${out.schema}, cycle=${cycle}, gates=${openGates.length})`);
