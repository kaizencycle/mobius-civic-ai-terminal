import { hashObject } from '@/lib/watchdog/batchRepair/stableHash';
import { CAPTURE_2014Z_EXPECTED_HASHES } from '@/lib/watchdog/batchRepair/trackRCaptureV2Governance';
import type { BatchApplyMutationJournal, BatchApplyWriteRecord } from '@/lib/watchdog/batchRepair/batchApplyMutationJournal';
import type { TrackRCaptureAttestationCheck } from '@/lib/watchdog/batchRepair/verifyTrackRCaptureAttestation';

export type P3OperatorPacket = {
  packet_type: 'track_r_p3_preparation_unsigned';
  workflow_run_id: string;
  timestamp: string;
  checked_out_commit: string;
  observed_production_commit: string | null;
  production_commit_match: boolean;
  capture_id: string;
  locked_hashes: {
    semantic_manifest_hash: string;
    lineage_snapshot_hash: string;
    execution_witness_hash: string;
    rollback_manifest_hash: string;
  };
  mutation_journal_id: string;
  mutation_journal_hash: string;
  intended_write_count: number;
  intended_block_numbers: number[];
  before_after_hashes: {
    before_active_version_hash: string | null;
    after_active_version_hash: string;
    write_record_hashes: string[];
  };
  rollback_verification: {
    verified: boolean;
    detail: string;
  };
  readiness_status: string;
  preflight_status: string;
  batch_apply_status: string;
  fresh_cas_match: boolean | null;
  commit_guard_ok: boolean;
  execution_authorized: false;
  production_mutation_performed: false;
  checks: TrackRCaptureAttestationCheck[];
  packet_hash: string;
};

function hashWriteRecords(records: readonly BatchApplyWriteRecord[]): string[] {
  return records.map((record) =>
    hashObject({
      key: record.key,
      before: record.before,
      after: record.after,
    }),
  );
}

export function buildP3OperatorPacket(args: {
  workflowRunId: string;
  timestamp: string;
  checkedOutCommit: string;
  observedProductionCommit: string | null;
  captureId: string;
  mutationJournal: BatchApplyMutationJournal;
  intendedWriteCount: number;
  intendedBlockNumbers: number[];
  beforeActiveVersion: string | null;
  afterActiveVersion: string;
  writeRecords: readonly BatchApplyWriteRecord[];
  rollbackVerified: boolean;
  rollbackDetail: string;
  readinessStatus: string;
  preflightStatus: string;
  batchApplyStatus: string;
  freshCasMatch: boolean | null;
  commitGuardOk: boolean;
  checks: TrackRCaptureAttestationCheck[];
}): P3OperatorPacket {
  const writeRecordHashes = hashWriteRecords(args.writeRecords);
  const packetWithoutHash = {
    packet_type: 'track_r_p3_preparation_unsigned' as const,
    workflow_run_id: args.workflowRunId,
    timestamp: args.timestamp,
    checked_out_commit: args.checkedOutCommit,
    observed_production_commit: args.observedProductionCommit,
    production_commit_match:
      args.observedProductionCommit !== null &&
      args.checkedOutCommit === args.observedProductionCommit,
    capture_id: args.captureId,
    locked_hashes: {
      semantic_manifest_hash: CAPTURE_2014Z_EXPECTED_HASHES.semantic_manifest_hash,
      lineage_snapshot_hash: CAPTURE_2014Z_EXPECTED_HASHES.lineage_snapshot_hash,
      execution_witness_hash: CAPTURE_2014Z_EXPECTED_HASHES.execution_witness_hash,
      rollback_manifest_hash: CAPTURE_2014Z_EXPECTED_HASHES.rollback_manifest_hash,
    },
    mutation_journal_id: args.mutationJournal.journal_id,
    mutation_journal_hash: args.mutationJournal.journal_hash,
    intended_write_count: args.intendedWriteCount,
    intended_block_numbers: [...args.intendedBlockNumbers].sort((a, b) => a - b),
    before_after_hashes: {
      before_active_version_hash: args.beforeActiveVersion
        ? hashObject({ active_version: args.beforeActiveVersion })
        : null,
      after_active_version_hash: hashObject({ active_version: args.afterActiveVersion }),
      write_record_hashes: writeRecordHashes,
    },
    rollback_verification: {
      verified: args.rollbackVerified,
      detail: args.rollbackDetail,
    },
    readiness_status: args.readinessStatus,
    preflight_status: args.preflightStatus,
    batch_apply_status: args.batchApplyStatus,
    fresh_cas_match: args.freshCasMatch,
    commit_guard_ok: args.commitGuardOk,
    execution_authorized: false as const,
    production_mutation_performed: false as const,
    checks: args.checks,
  };

  return Object.freeze({
    ...packetWithoutHash,
    packet_hash: hashObject(packetWithoutHash),
  });
}

export function renderP3OperatorPacketMarkdown(packet: P3OperatorPacket): string {
  return [
    '# Track R P3 Preparation — Unsigned Operator Packet',
    '',
    '> **UNSIGNED — NOT EXECUTION AUTHORIZATION**',
    '> `execution_authorized` remains `false`. Production mutation forbidden.',
    '',
    `- **packet_type:** \`${packet.packet_type}\``,
    `- **workflow_run_id:** \`${packet.workflow_run_id}\``,
    `- **timestamp:** \`${packet.timestamp}\``,
    `- **checked_out_commit:** \`${packet.checked_out_commit}\``,
    `- **observed_production_commit:** \`${packet.observed_production_commit ?? 'unbound'}\``,
    `- **production_commit_match:** \`${packet.production_commit_match}\``,
    `- **capture_id:** \`${packet.capture_id}\``,
    '',
    '## Locked hashes',
    '',
    `- semantic_manifest_hash: \`${packet.locked_hashes.semantic_manifest_hash}\``,
    `- lineage_snapshot_hash: \`${packet.locked_hashes.lineage_snapshot_hash}\``,
    `- execution_witness_hash: \`${packet.locked_hashes.execution_witness_hash}\``,
    `- rollback_manifest_hash: \`${packet.locked_hashes.rollback_manifest_hash}\``,
    '',
    '## Proposed mutation journal',
    '',
    `- mutation_journal_id: \`${packet.mutation_journal_id}\``,
    `- mutation_journal_hash: \`${packet.mutation_journal_hash}\``,
    `- intended_write_count: \`${packet.intended_write_count}\``,
    `- intended_block_numbers: \`${packet.intended_block_numbers.length} blocks (1–131 contested set)\``,
    '',
    '## Gate results',
    '',
    `- readiness_status: \`${packet.readiness_status}\``,
    `- preflight_status: \`${packet.preflight_status}\``,
    `- batch_apply_status: \`${packet.batch_apply_status}\``,
    `- fresh_cas_match: \`${packet.fresh_cas_match}\``,
    `- commit_guard_ok: \`${packet.commit_guard_ok}\``,
    `- rollback_verified: \`${packet.rollback_verification.verified}\``,
    `- execution_authorized: \`false\``,
    `- production_mutation_performed: \`false\``,
    '',
    `- packet_hash: \`${packet.packet_hash}\``,
  ].join('\n');
}
