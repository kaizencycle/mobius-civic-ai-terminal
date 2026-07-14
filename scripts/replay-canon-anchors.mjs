#!/usr/bin/env node
/**
 * Re-post .dat hash anchors to CPC from cold MANIFEST.json (no KV re-export).
 * Use after CPC redeploy when canon routes are live but anchors were lost/missed.
 *
 * EPICON: C-357 | C-371 remediation
 *
 * Usage:
 *   CPC_BASE_URL=https://civic-protocol-core-ledger.onrender.com \
 *   AGENT_SERVICE_TOKEN=... \
 *   node scripts/replay-canon-anchors.mjs
 *
 * Optional:
 *   MANIFEST_URL — default: Mobius-Substrate main MANIFEST.json
 *   DRY_RUN=1      — print payloads only
 */

const MANIFEST_URL =
  process.env.MANIFEST_URL ??
  'https://raw.githubusercontent.com/kaizencycle/Mobius-Substrate/main/canon/reserve-blocks/MANIFEST.json';

const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';

function normalizeHostBase(url) {
  const trimmed = url.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (trimmed.includes('/api/')) {
    try {
      return new URL(trimmed).origin;
    } catch {
      return trimmed.split('/api/')[0] ?? trimmed;
    }
  }
  return trimmed;
}

function resolveCpcBaseUrl() {
  const candidates = [
    process.env.CPC_BASE_URL,
    process.env.RENDER_LEDGER_URL,
    process.env.CIVIC_LEDGER_URL,
    process.env.NEXT_PUBLIC_CIVIC_LEDGER_URL,
  ].filter(Boolean);

  for (const raw of candidates) {
    const base = normalizeHostBase(raw);
    if (!base || base.includes('github.com')) continue;
    return base;
  }
  return 'https://civic-protocol-core-ledger.onrender.com';
}

async function postAnchor(base, token, payload) {
  const url = `${base}/api/canon/reserve-blocks/anchor`;
  if (DRY_RUN) {
    console.log('[dry-run] POST', url, JSON.stringify(payload, null, 2));
    return { success: true, action: 'dry-run' };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Mobius-EPICON': 'C-357:RESERVE_BLOCK_DAT_CANONIZATION',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  });

  const text = await res.text();
  if (res.status === 409) {
    return { success: false, error: `CONFLICT ${payload.dat_file}: ${text}` };
  }
  if (!res.ok) {
    return { success: false, error: `HTTP ${res.status}: ${text}` };
  }

  const data = JSON.parse(text);
  return { success: true, action: data.action ?? 'anchored' };
}

async function main() {
  const base = resolveCpcBaseUrl();
  const token = process.env.AGENT_SERVICE_TOKEN ?? '';

  console.log('CPC base:', base);
  console.log('Manifest:', MANIFEST_URL);

  if (!token && !DRY_RUN) {
    console.error('AGENT_SERVICE_TOKEN required (or set DRY_RUN=1)');
    process.exit(1);
  }

  const manifestRes = await fetch(MANIFEST_URL, { signal: AbortSignal.timeout(20_000) });
  if (!manifestRes.ok) {
    console.error(`Failed to fetch manifest: HTTP ${manifestRes.status}`);
    process.exit(1);
  }

  const manifest = await manifestRes.json();
  const files = Object.entries(manifest.files ?? {}).sort(([a], [b]) => a.localeCompare(b));

  if (files.length === 0) {
    console.error('No files in manifest');
    process.exit(1);
  }

  console.log(`Anchoring ${files.length} file(s) — ${manifest.total_blocks} blocks, tip ${manifest.chain_tip_hash}`);

  let ok = 0;
  let failed = 0;

  for (const [datFile, entry] of files) {
    const payload = {
      dat_file: datFile,
      file_hash: entry.sha256,
      block_range_start: entry.range[0],
      block_range_end: entry.range[1],
      block_count: entry.block_count,
      chain_tip_hash: manifest.chain_tip_hash,
      version: manifest.version ?? '1.0',
      canonized_at: manifest.generated_at ?? new Date().toISOString(),
    };

    const result = await postAnchor(base, token, payload);
    if (result.success) {
      ok += 1;
      console.log(`✓ ${datFile} (${result.action})`);
    } else {
      failed += 1;
      console.error(`✗ ${datFile}: ${result.error}`);
    }
  }

  if (!DRY_RUN) {
    const verifyRes = await fetch(`${base}/api/canon/reserve-blocks/manifest`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (verifyRes.ok) {
      const live = await verifyRes.json();
      console.log('\nCPC manifest after replay:');
      console.log(
        JSON.stringify(
          {
            total_dat_files: live.total_dat_files,
            total_blocks_anchored: live.total_blocks_anchored,
            chain_tip_hash: live.chain_tip_hash,
          },
          null,
          2,
        ),
      );
    } else {
      console.warn(`\nWarning: manifest probe HTTP ${verifyRes.status} — routes may still be missing`);
    }
  }

  console.log(`\nDone: ${ok} ok, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
