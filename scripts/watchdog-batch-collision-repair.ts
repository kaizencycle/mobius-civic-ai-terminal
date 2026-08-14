#!/usr/bin/env tsx
/**
 * C-403 Track R batch collision repair — dry-run only (default).
 *
 * Usage:
 *   pnpm watchdog:batch-collision-repair
 *   pnpm watchdog:batch-collision-repair --witness docs/epicon/cycles/C-403/fixtures/C403_RESERVE_BLOCK_COLLISION_WITNESS.pin.json
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  TRACK_R_BATCH_REPAIR_ID,
  executeBatchDryRun,
  dryRunReportHash,
  demonstrateSingleReceiptCircularDependency,
  buildFixtureSealsFromWitness,
  loadWitnessFromFile,
  loadResolutionTableFromFile,
} from '@/lib/watchdog/batchRepair';

const DEFAULT_WITNESS = 'docs/epicon/cycles/C-403/fixtures/C403_RESERVE_BLOCK_COLLISION_WITNESS.pin.json';
const DEFAULT_TABLE =
  'docs/epicon/cycles/C-403/fixtures/C403_COLLISION_RESOLUTION_TABLE.pin.json';

function parseArgs(argv: string[]): { witness: string; table: string; out: string | null } {
  let witness = DEFAULT_WITNESS;
  let table = DEFAULT_TABLE;
  let out: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--witness' && argv[i + 1]) {
      witness = argv[++i];
    }
    if (argv[i] === '--table' && argv[i + 1]) {
      table = argv[++i];
    }
    if (argv[i] === '--out' && argv[i + 1]) {
      out = argv[++i];
    }
    if (argv[i] === '--apply') {
      console.error('ERROR: --apply is forbidden. Batch production execution is disabled.');
      process.exit(2);
    }
  }
  return { witness, table, out };
}

async function main(): Promise<void> {
  const { witness, table, out } = parseArgs(process.argv.slice(2));
  console.log(`Mode: dry-run (default). Repair ID: ${TRACK_R_BATCH_REPAIR_ID}\n`);

  const result = await executeBatchDryRun({
    witnessPath: witness,
    resolutionTablePath: table,
    created_at: '2026-08-14T00:00:00.000Z',
  });

  if (result.manifest && result.report) {
    const seals = buildFixtureSealsFromWitness(
      loadWitnessFromFile(witness),
      loadResolutionTableFromFile(table),
    );
    const circular = await demonstrateSingleReceiptCircularDependency({
      manifest: result.manifest,
      seals,
    });
    console.log(`Single-receipt circular dependency: ${circular.fails_without_batch ? 'confirmed' : 'NOT confirmed'}`);
    console.log(`  ${circular.detail}\n`);
  }

  if (result.report) {
    console.log('Metrics:', JSON.stringify(result.report.metrics, null, 2));
    console.log(`\nManifest hash: ${result.report.manifest_hash}`);
    console.log(`Report hash: ${dryRunReportHash(result.report)}`);

    const outPath =
      out ?? 'docs/epicon/cycles/C-403/fixtures/C403_BATCH_DRY_RUN_REPORT.sample.json';
    writeFileSync(outPath, `${JSON.stringify(result.report, null, 2)}\n`);
    console.log(`\nWrote sample report: ${outPath}`);
  }

  if (!result.ok) {
    console.error('\nDry-run FAILED:');
    for (const err of result.errors) console.error(`  - ${err}`);
    process.exit(1);
  }

  console.log('\nDry-run OK. Zero writes. Execution remains disabled.');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
