#!/usr/bin/env tsx
/**
 * Forensic audit: hot KV prev_seal_hash lineage components (chain continuity).
 *
 * Usage:
 *   npx tsx scripts/audit-seal-hash-lineage.ts
 *   npx tsx scripts/audit-seal-hash-lineage.ts --json
 *
 * Requires KV_REST_API_URL + KV_REST_API_TOKEN (local .env.local or GitHub Actions:
 *   workflow audit-reserve-block-lineage.yml).
 */

import { config } from 'dotenv';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { analyzeSealHashLineage } from '@/lib/dat/sealHashLineage';
import { resolveExportCycle } from '@/lib/dat/resolveExportCycle';
import { listAllSeals } from '@/lib/vault-v2/store';

config({ path: '.env.local' });

async function main(): Promise<void> {
  const jsonOut = process.argv.includes('--json');
  const operatorCycle = resolveExportCycle();

  const seals = await listAllSeals(10_000);
  const report = analyzeSealHashLineage(seals);

  const payload = {
    operator_cycle: operatorCycle,
    audited_at: new Date().toISOString(),
    ...report,
  };

  if (jsonOut) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(`
Seal hash lineage audit (${operatorCycle})
  Attested seals:         ${report.attested_count}
  Hash-valid seals:       ${report.hash_valid_count}
  Hash-invalid seals:     ${report.hash_invalid_count}
  Genesis seals (prev ∅): ${report.genesis_count}
  Lineage components:     ${report.components.length}${report.multiple_lineages ? '  *** MULTIPLE ***' : ''}
  Link issues:            ${report.link_issues.length}
  Re-attest clusters:     ${report.reattest_clusters.length}
`);

  for (const component of report.components) {
    console.log(
      `  Component ${component.id}: ${component.seal_count} seals, seq ${component.sequence_min}–${component.sequence_max}, cycles ${component.cycles.join(', ')}, fountain [${component.fountain_statuses.join(', ')}]`,
    );
    console.log(`    genesis: ${component.genesis_seals.join(', ') || '—'}`);
    console.log(`    tips:    ${component.tip_seals.join(', ') || '—'}`);
  }

  if (report.reattest_clusters.length > 0) {
    console.log('\nBulk substrate_attested_at clusters (≥5 seals, spread sealed_at >7d):');
    for (const cluster of report.reattest_clusters.slice(0, 5)) {
      console.log(
        `  ${cluster.attested_at_hour}: ${cluster.seal_count} seals, seq ${cluster.sequence_range[0]}–${cluster.sequence_range[1]}, cycles ${cluster.cycles.join(', ')}`,
      );
    }
  }

  const outPath = `./canon/reserve-blocks/LINEAGE_AUDIT_${operatorCycle.replace(/-/g, '')}.json`;
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`\nFull report: ${outPath}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
