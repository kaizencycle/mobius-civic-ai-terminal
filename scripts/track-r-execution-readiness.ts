#!/usr/bin/env tsx
import { config } from 'dotenv';

config({ path: '.env.local' });

import { verifyTrackRExecutionReadiness } from '@/lib/watchdog/batchRepair/verifyTrackRExecutionReadiness';

async function main(): Promise<void> {
  const baseUrlIndex = process.argv.indexOf('--base-url');
  const baseUrl =
    baseUrlIndex >= 0 && process.argv[baseUrlIndex + 1]
      ? process.argv[baseUrlIndex + 1]
      : undefined;
  const skipCas = process.argv.includes('--skip-cas-probe');

  const result = await verifyTrackRExecutionReadiness({
    baseUrl,
    probeFreshCas: !skipCas,
  });

  console.log(`Capture ID: ${result.capture_id}`);
  console.log(`Readiness status: ${result.readiness_status}`);
  console.log(`Execution authorized: ${result.execution_authorized}`);
  console.log(`Attested lineage CAS: ${result.attested_lineage_snapshot_hash}`);
  console.log(`Fresh lineage CAS: ${result.fresh_lineage_snapshot_hash ?? 'not probed'}`);
  console.log(`Fresh CAS match: ${result.fresh_cas_match ?? 'not probed'}`);
  console.log('');

  for (const row of result.checks) {
    const icon = row.result === 'pass' ? '✓' : row.result === 'warn' ? '!' : '✗';
    console.log(`${icon} [${row.result}] ${row.check}`);
    console.log(`  ${row.detail}`);
  }

  if (result.readiness_status !== 'awaiting_human_consent') {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
