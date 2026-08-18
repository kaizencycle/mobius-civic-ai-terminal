import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BatchApplyMutationJournal, BatchApplyWriteRecord } from '@/lib/watchdog/batchRepair/batchApplyMutationJournal';
import type { P3OperatorPacket } from '@/lib/watchdog/batchRepair/buildP3OperatorPacket';
import type { P3PreparationResult } from '@/lib/watchdog/batchRepair/runTrackRP3Preparation';

export type P3EvidenceManifest = {
  schema_version: '1';
  generated_at: string;
  workflow_run_id: string;
  execution_authorized: false;
  production_mutation_performed: false;
  files: Record<
    string,
    {
      sha256: string;
      bytes: number;
    }
  >;
  cross_references: {
    mutation_journal_id: string | null;
    mutation_journal_hash: string | null;
    operator_packet_hash: string | null;
  };
};

function sha256File(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function writeJson(path: string, value: unknown): { sha256: string; bytes: number } {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  writeFileSync(path, content, 'utf8');
  return { sha256: sha256File(content), bytes: Buffer.byteLength(content, 'utf8') };
}

function writeText(path: string, content: string): { sha256: string; bytes: number } {
  const normalized = content.endsWith('\n') ? content : `${content}\n`;
  writeFileSync(path, normalized, 'utf8');
  return { sha256: sha256File(normalized), bytes: Buffer.byteLength(normalized, 'utf8') };
}

export function renderProbeLog(args: {
  title: string;
  status: string | null;
  checks: readonly { check: string; result: string; detail: string }[];
  extras?: Record<string, string | number | boolean | null>;
}): string {
  const lines = [args.title, ''];
  if (args.extras) {
    for (const [key, value] of Object.entries(args.extras)) {
      lines.push(`${key}: ${value ?? 'n/a'}`);
    }
    lines.push('');
  }
  lines.push(`status: ${args.status ?? 'n/a'}`, '');
  for (const row of args.checks) {
    lines.push(`[${row.result}] ${row.check}`);
    lines.push(`  ${row.detail}`);
  }
  return lines.join('\n');
}

export function materializeP3PreparationEvidence(args: {
  outputDir: string;
  result: P3PreparationResult;
  workflowRunId: string;
  mutationJournal: BatchApplyMutationJournal | null;
  writeRecords: readonly BatchApplyWriteRecord[];
  intendedBlockNumbers: number[];
  rollbackVerified: boolean;
  rollbackDetail: string;
  readinessLog: string;
  preflightLog: string;
  batchApplyLog: string;
}): P3EvidenceManifest {
  mkdirSync(args.outputDir, { recursive: true });

  const files: P3EvidenceManifest['files'] = {};

  files['readiness.log'] = writeText(join(args.outputDir, 'readiness.log'), args.readinessLog);
  files['batch-apply-preflight.log'] = writeText(
    join(args.outputDir, 'batch-apply-preflight.log'),
    args.preflightLog,
  );
  files['batch-apply-dry-run.log'] = writeText(
    join(args.outputDir, 'batch-apply-dry-run.log'),
    args.batchApplyLog,
  );

  if (args.result.operator_packet) {
    files['operator-packet.json'] = writeJson(
      join(args.outputDir, 'operator-packet.json'),
      args.result.operator_packet,
    );
  }
  if (args.result.operator_packet_markdown) {
    files['operator-packet.md'] = writeText(
      join(args.outputDir, 'operator-packet.md'),
      args.result.operator_packet_markdown,
    );
  }
  if (args.mutationJournal) {
    files['mutation-journal.json'] = writeJson(
      join(args.outputDir, 'mutation-journal.json'),
      args.mutationJournal,
    );
  }

  files['intended-writes.json'] = writeJson(join(args.outputDir, 'intended-writes.json'), {
    intended_write_count: args.result.writes_planned,
    intended_block_numbers: args.intendedBlockNumbers,
    write_records: args.writeRecords,
    execution_authorized: false,
    production_mutation_performed: false,
  });

  files['rollback-verification.json'] = writeJson(join(args.outputDir, 'rollback-verification.json'), {
    verified: args.rollbackVerified,
    detail: args.rollbackDetail,
    execution_authorized: false,
  });

  const manifest: P3EvidenceManifest = {
    schema_version: '1',
    generated_at: args.result.verified_at,
    workflow_run_id: args.workflowRunId,
    execution_authorized: false,
    production_mutation_performed: false,
    files,
    cross_references: {
      mutation_journal_id: args.mutationJournal?.journal_id ?? null,
      mutation_journal_hash: args.mutationJournal?.journal_hash ?? null,
      operator_packet_hash: args.result.operator_packet?.packet_hash ?? null,
    },
  };

  files['evidence-manifest.json'] = writeJson(join(args.outputDir, 'evidence-manifest.json'), manifest);
  return manifest;
}
