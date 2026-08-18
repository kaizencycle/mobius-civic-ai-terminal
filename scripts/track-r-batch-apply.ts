#!/usr/bin/env tsx
import { config } from 'dotenv';

config({ path: '.env.local' });

import { runBatchApply } from '@/lib/watchdog/batchRepair/runBatchApply';
import { CAPTURE_2014Z_ID } from '@/lib/watchdog/batchRepair/trackRCaptureV2Governance';
import { parseTrackRCliArgs } from './track-r-cli-args';

async function main(): Promise<void> {
  const { baseUrl, captureId, skipCasProbe, apply, explicitOperatorCommand } =
    parseTrackRCliArgs(process.argv);

  const result = await runBatchApply({
    baseUrl,
    captureId,
    skipCasProbe,
    apply,
    explicitOperatorCommand,
  });

  console.log(`Capture ID: ${result.capture_id}`);
  console.log(`Mode: ${result.mode}`);
  console.log(`Apply status: ${result.apply_status}`);
  console.log(`Execution authorized: ${result.execution_authorized}`);
  console.log(`Production mutation performed: ${result.production_mutation_performed}`);
  console.log(`Attested lineage CAS: ${result.attested_lineage_snapshot_hash}`);
  console.log(`Fresh lineage CAS: ${result.fresh_lineage_snapshot_hash ?? 'not probed'}`);
  console.log(`Fresh CAS match: ${result.fresh_cas_match ?? 'not probed'}`);
  console.log(`Writes planned: ${result.writes_planned}`);
  console.log(`Writes performed: ${result.writes_performed}`);
  if (result.mutation_journal) {
    console.log(`Mutation journal: ${result.mutation_journal.journal_id}`);
    console.log(`Mutation journal hash: ${result.mutation_journal.journal_hash}`);
  }
  console.log('');

  for (const row of result.checks) {
    const icon = row.result === 'pass' ? '✓' : row.result === 'warn' ? '!' : '✗';
    console.log(`${icon} [${row.result}] ${row.check}`);
    console.log(`  ${row.detail}`);
  }

  if (result.errors.length > 0) {
    console.log('');
    console.log('Errors:');
    for (const error of result.errors) {
      console.log(`- ${error}`);
    }
  }

  if (captureId && captureId !== CAPTURE_2014Z_ID) {
    process.exit(1);
  }

  if (result.apply_status !== 'dry_run_pass' && result.apply_status !== 'live_apply_pass') {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
