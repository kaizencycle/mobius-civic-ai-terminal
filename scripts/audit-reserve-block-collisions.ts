#!/usr/bin/env tsx
/**
 * Forensic audit: duplicate block_number collisions in attested Reserve Block seals.
 *
 * Usage:
 *   npx tsx scripts/audit-reserve-block-collisions.ts
 *   npx tsx scripts/audit-reserve-block-collisions.ts --json
 *   npx tsx scripts/audit-reserve-block-collisions.ts --hash-divergence-only
 */

import { config } from 'dotenv';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { analyzeReserveBlockCollisions } from '@/lib/dat/reserveBlockCollisions';
import { resolveExportCycle } from '@/lib/dat/resolveExportCycle';
import { listAllSeals } from '@/lib/vault-v2/store';

config({ path: '.env.local' });

async function main(): Promise<void> {
  const jsonOut = process.argv.includes('--json');
  const hashOnly = process.argv.includes('--hash-divergence-only');
  const operatorCycle = resolveExportCycle();

  const seals = await listAllSeals(10_000);
  const report = analyzeReserveBlockCollisions(seals);

  const hashDivergent = report.collisions.filter((c) => c.seal_hashes_differ);
  const rows = hashOnly ? hashDivergent : report.collisions;

  const payload = {
    operator_cycle: operatorCycle,
    audited_at: new Date().toISOString(),
    ...report,
    hash_divergent_collisions: hashDivergent.length,
    collisions: rows,
  };

  if (jsonOut) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(`
Reserve Block collision audit (${operatorCycle})
  Raw attested seals:     ${report.raw_attested_count}
  Unique block_numbers:   ${report.unique_block_count}
  Collisions (pairs):     ${report.collision_count}
  Hash divergent pairs:   ${hashDivergent.length}
`);

  if (rows.length === 0) {
    console.log('No collisions in scope.');
  } else {
    console.log('Sample collisions:');
    for (const c of rows.slice(0, 25)) {
      console.log(
        `  #${c.block_number}: kept ${c.kept_seal_id} (${c.kept_cycle}, q=${c.kept_quorum}) ` +
          `dropped ${c.dropped_seal_id} (${c.dropped_cycle}, q=${c.dropped_quorum})` +
          (c.seal_hashes_differ ? ' [HASH DIFF]' : ''),
      );
    }
    if (rows.length > 25) {
      console.log(`  ... +${rows.length - 25} more`);
    }
  }

  const outPath = `./canon/reserve-blocks/COLLISION_AUDIT_${operatorCycle.replace(/-/g, '')}.json`;
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`\nFull report: ${outPath}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
