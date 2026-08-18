#!/usr/bin/env tsx
import { config } from 'dotenv';

config({ path: '.env.local' });

import {
  P3_PREPARATION_DRY_RUN_MODE,
  runTrackRP3Preparation,
} from '@/lib/watchdog/batchRepair/runTrackRP3Preparation';
import { CAPTURE_2014Z_ID } from '@/lib/watchdog/batchRepair/trackRCaptureV2Governance';
import { parseTrackRCliArgs } from './track-r-cli-args';

async function main(): Promise<void> {
  const { baseUrl, captureId, skipCasProbe, apply } = parseTrackRCliArgs(process.argv);
  const dryRunMode = process.env.TRACK_R_P3_DRY_RUN_MODE;
  const checkedOutCommit =
    process.env.TRACK_R_CHECKED_OUT_COMMIT ?? process.env.GITHUB_SHA ?? 'local-dev';
  const workflowRunId = process.env.GITHUB_RUN_ID ?? `local-${Date.now()}`;

  const result = await runTrackRP3Preparation({
    baseUrl: baseUrl ?? 'https://mobius-civic-ai-terminal.vercel.app',
    captureId: captureId ?? CAPTURE_2014Z_ID,
    checkedOutCommit,
    workflowRunId,
    dryRunMode: dryRunMode ?? '',
    apply,
    skipCasProbe,
    requireProductionCommitMatch: process.env.TRACK_R_REQUIRE_PRODUCTION_COMMIT_MATCH !== 'false',
  });

  console.log(`P3 preparation status: ${result.status}`);
  console.log(`Capture ID: ${result.capture_id}`);
  console.log(`Checked out commit: ${result.checked_out_commit}`);
  console.log(`Observed production commit: ${result.observed_production_commit ?? 'unbound'}`);
  console.log(`Production commit match: ${result.production_commit_match}`);
  console.log(`Readiness status: ${result.readiness_status ?? 'n/a'}`);
  console.log(`Preflight status: ${result.preflight_status ?? 'n/a'}`);
  console.log(`Batch apply status: ${result.batch_apply_status ?? 'n/a'}`);
  console.log(`Fresh CAS match: ${result.fresh_cas_match ?? 'n/a'}`);
  console.log(`Writes planned: ${result.writes_planned}`);
  console.log(`Writes performed: ${result.writes_performed}`);
  console.log(`Execution authorized: ${result.execution_authorized}`);
  console.log(`Production mutation performed: ${result.production_mutation_performed}`);
  if (result.operator_packet) {
    console.log(`Mutation journal ID: ${result.operator_packet.mutation_journal_id}`);
    console.log(`Mutation journal hash: ${result.operator_packet.mutation_journal_hash}`);
    console.log(`Operator packet hash: ${result.operator_packet.packet_hash}`);
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

  if (dryRunMode !== P3_PREPARATION_DRY_RUN_MODE) {
    process.exit(1);
  }

  if (result.status !== 'p3_preparation_pass') {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
