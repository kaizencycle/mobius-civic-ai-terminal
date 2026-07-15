#!/usr/bin/env tsx
/**
 * C-373 collision audit — read-only, dry-run by default.
 *
 * Usage:
 *   pnpm watchdog:collision-audit
 *   pnpm watchdog:collision-audit --json
 *   pnpm watchdog:collision-audit --out ./artifacts/C-373/collision-audit.json
 */

import { config } from 'dotenv';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  auditHasCriticalCollisions,
  buildCollisionAuditReport,
} from '@/lib/watchdog/collisionAudit';
import { resolveExportCycle } from '@/lib/dat/resolveExportCycle';
import { listAllSeals } from '@/lib/vault-v2/store';

config({ path: '.env.local' });

function parseArgs(argv: string[]): { json: boolean; out: string | null } {
  let json = false;
  let out: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--json') json = true;
    if (argv[i] === '--out' && argv[i + 1]) {
      out = argv[i + 1];
      i++;
    }
  }
  return { json, out };
}

async function main(): Promise<void> {
  const { json, out } = parseArgs(process.argv.slice(2));
  const cycle = resolveExportCycle();

  const seals = await listAllSeals(10_000);
  const report = buildCollisionAuditReport(seals, { cycle });

  if (out) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(report, null, 2), 'utf8');
  }

  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`
C-373 Vault/KV collision audit (${cycle})
  Audited at:                 ${report.audited_at}
  Raw attested seals:         ${report.raw_attested_count}
  Unique block_numbers:       ${report.unique_block_count}
  Collision groups:           ${report.collision_group_count}
  Hash-divergent groups:      ${report.hash_divergent_group_count}
  Critical:                   ${report.critical ? 'YES' : 'no'}
`);
    if (report.collisions.length === 0) {
      console.log('No sequence collisions detected.');
    } else {
      console.log('Collision groups (sample):');
      for (const c of report.collisions.slice(0, 15)) {
        console.log(
          `  #${c.block_number}: ${c.candidate_seals.length} candidates, preferred=${c.preferred_by_current_algorithm}` +
            (c.hash_divergent ? ' [HASH DIVERGENT — human review required]' : ''),
        );
      }
      if (report.collisions.length > 15) {
        console.log(`  ... +${report.collisions.length - 15} more`);
      }
    }
    if (out) console.log(`\nFull JSON: ${out}`);
    console.log('\nMode: read-only audit (no KV mutations).');
  }

  if (auditHasCriticalCollisions(report)) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
