#!/usr/bin/env tsx
import { config } from 'dotenv';

config({ path: '.env.local' });

import { verifyTrackRExecutionReadiness } from '@/lib/watchdog/batchRepair/verifyTrackRExecutionReadiness';
import { parseTrackRCliArgs } from './track-r-cli-args';

async function main(): Promise<void> {
  const { baseUrl, captureId, skipCasProbe } = parseTrackRCliArgs(process.argv);

  const result = await verifyTrackRExecutionReadiness({
    baseUrl,
    captureId,
    probeFreshCas: !skipCasProbe,
  });

  console.log(`Capture ID: ${result.capture_id}`);
  console.log(`Lineage snapshot version: ${result.lineage_snapshot_version}`);
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

  if (
    result.readiness_status !== 'awaiting_human_consent' &&
    result.readiness_status !== 'awaiting_execution_handoff' &&
    result.readiness_status !== 'consent_recorded_cas_required'
  ) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
