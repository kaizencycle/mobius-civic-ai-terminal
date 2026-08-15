#!/usr/bin/env tsx
import { config } from 'dotenv';

config({ path: '.env.local' });

import { runBatchApplyPreflight } from '@/lib/watchdog/batchRepair/runBatchApplyPreflight';

async function main(): Promise<void> {
  const baseUrlIndex = process.argv.indexOf('--base-url');
  const baseUrl =
    baseUrlIndex >= 0 && process.argv[baseUrlIndex + 1]
      ? process.argv[baseUrlIndex + 1]
      : undefined;

  const result = await runBatchApplyPreflight({
    baseUrl,
    explicitOperatorCommand: true,
    requireExecutionFeatureFlag: false,
  });

  console.log(`Capture ID: ${result.capture_id}`);
  console.log(`Preflight status: ${result.preflight_status}`);
  console.log(`Execution authorized: ${result.execution_authorized}`);
  console.log(`Production mutation performed: ${result.production_mutation_performed}`);
  console.log(`Attested lineage CAS: ${result.attested_lineage_snapshot_hash}`);
  console.log(`Fresh lineage CAS: ${result.fresh_lineage_snapshot_hash ?? 'not probed'}`);
  console.log(`Apply-time CAS match: ${result.fresh_lineage_snapshot_hash_matches}`);
  console.log(`Commit guard preflight: ${result.commit_guard_ok ? 'pass' : 'fail'}`);
  console.log('');

  for (const row of result.checks) {
    const icon = row.result === 'pass' ? '✓' : row.result === 'warn' ? '!' : '✗';
    console.log(`${icon} [${row.result}] ${row.check}`);
    console.log(`  ${row.detail}`);
  }

  if (result.preflight_status !== 'apply_preflight_pass') {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
