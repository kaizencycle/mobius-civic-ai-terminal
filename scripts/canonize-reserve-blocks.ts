#!/usr/bin/env tsx
/**
 * ONE-SHOT MIGRATION: canonize all sealed Reserve Blocks into .dat cold canon.
 *
 * Usage:
 *   npx tsx scripts/canonize-reserve-blocks.ts
 *   npx tsx scripts/canonize-reserve-blocks.ts --dry-run
 *   npx tsx scripts/canonize-reserve-blocks.ts --skip-cpc
 *   npx tsx scripts/canonize-reserve-blocks.ts --force-api
 *   npx tsx scripts/canonize-reserve-blocks.ts --incremental
 *
 * EPICON: C-357 | RESERVE_BLOCK_DAT_CANONIZATION
 */

import { config } from 'dotenv';
import { writeFileSync } from 'fs';
import { canonizeReserveBlocks } from '@/lib/dat/canonize';

config({ path: '.env.local' });

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const skipCpc = args.includes('--skip-cpc');
  const forceApi = args.includes('--force-api');
  const incremental = args.includes('--incremental');
  const outputDir =
    args.find((a) => a.startsWith('--output='))?.split('=')[1] ?? './canon/reserve-blocks';

  console.log(`
╔═══════════════════════════════════════════════════════════╗
║  MOBIUS SUBSTRATE — Reserve Block .dat Canonization       ║
║  EPICON: C-357 | RESERVE_BLOCK_DAT_CANONIZATION           ║
╚═══════════════════════════════════════════════════════════╝

  Mode:        ${dryRun ? 'DRY RUN' : 'LIVE'}
  Incremental: ${incremental ? 'yes' : 'no (full prime)'}
  CPC anchors: ${skipCpc ? 'skipped' : 'enabled'}
  Fetch:       ${forceApi ? 'forced API' : 'KV (with API fallback)'}
  Output:      ${outputDir}
`);

  if (!dryRun && !process.env.CI) {
    console.log('Proceeding in 3 seconds... (Ctrl+C to cancel)');
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  const startMs = Date.now();

  const result = await canonizeReserveBlocks({
    outputDir,
    dryRun,
    skipCpcAnchors: skipCpc,
    forceApi,
    verbose: true,
    incremental,
  });

  const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);

  console.log(`
CANONIZATION RESULT — C-357
  Blocks processed:   ${result.total_blocks_processed}
  MIC canonized:      ${result.total_mic_canonized.toFixed(2)}
  .dat files written: ${result.dat_files_written.join(', ') || 'none'}
  CPC anchors:        ${result.cpc_anchors_posted} new, ${result.cpc_anchors_idempotent} idempotent
  Errors:             ${result.errors.length}
  Chain tip:          ${result.chain_tip_hash.slice(0, 20)}...
  Substrate ready:    ${result.substrate_commit_ready ? 'YES' : 'NO'}
  Elapsed:            ${elapsed}s
`);

  if (!dryRun) {
    const resultPath = `${outputDir}/CANONIZATION_LOG_C357.json`;
    writeFileSync(resultPath, JSON.stringify(result, null, 2), 'utf8');
    console.log(`Result log: ${resultPath}`);
  }

  if (!incremental && !dryRun && result.total_blocks_processed === 0) {
    console.error(
      '[canonize] Full prime exported 0 blocks — verify KV_REST_API_* secrets (no trailing newlines) and attested seal count in production KV',
    );
    process.exit(1);
  }

  process.exit(result.substrate_commit_ready ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
