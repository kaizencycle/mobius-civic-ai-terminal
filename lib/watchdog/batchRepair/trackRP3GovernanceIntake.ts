import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import type { BatchApplyMutationJournal } from '@/lib/watchdog/batchRepair/batchApplyMutationJournal';
import type { P3OperatorPacket } from '@/lib/watchdog/batchRepair/buildP3OperatorPacket';
import type { P3EvidenceManifest } from '@/lib/watchdog/batchRepair/materializeP3PreparationEvidence';
import {
  compareIssuedPacketRegistryEntries,
  loadIssuedPacketRegistry,
  type IssuedPacketRegistryEntry,
} from '@/lib/watchdog/batchRepair/p3IssuedPacketRegistry';
import {
  assertApplyPreflightPass,
  assertAwaitingExecutionHandoff,
  assertCaptureNineBinding,
  assertFreshCasMatch,
  assertLockedHashBinding,
  assertMutationJournalComplete,
  assertSignedHandoffNotConsumed,
} from '@/lib/watchdog/batchRepair/p3PreparationSafety';
import { assertProductionCommitBinding } from '@/lib/watchdog/batchRepair/productionDeploymentBinding';
import { hashObject, sha256Hex } from '@/lib/watchdog/batchRepair/stableHash';
import { CAPTURE_2014Z_ID } from '@/lib/watchdog/batchRepair/trackRCaptureV2Governance';

export const P3_PREPARATION_RUNS_BASE =
  'docs/epicon/cycles/C-407/p3-preparation/runs' as const;

export const TRACK_R_P3_EXPECTED_WRITE_KEYS = [
  'watchdog:lineage:version:track-r-c403-batch-001:manifest',
  'watchdog:lineage:version:track-r-c403-batch-001:canonical',
  'watchdog:lineage:version:track-r-c403-batch-001:quarantine',
  'watchdog:lineage:active_version',
] as const;

const REQUIRED_EVIDENCE_FILES = [
  'operator-packet.json',
  'evidence-manifest.json',
  'mutation-journal.json',
  'intended-writes.json',
  'rollback-verification.json',
] as const;

const WORKFLOW_RUN_ID_PATTERN = /^\d+$/;

export type TrackRP3EvidenceIdentity = {
  workflow_run_id: string;
  packet_hash: string;
  journal_id: string;
  journal_hash: string;
  observed_production_commit: string;
  capture_id: string;
  evidence_file_hashes: Record<string, string>;
};

export type TrackRP3ReviewContext = TrackRP3EvidenceIdentity & {
  issued_at: string;
  checked_out_commit: string;
  run_directory: string;
  operator_packet: Readonly<P3OperatorPacket>;
  mutation_journal: Readonly<BatchApplyMutationJournal>;
  evidence_manifest: Readonly<P3EvidenceManifest>;
};

export type TrackRP3PacketDisposition = {
  workflow_run_id: string;
  packet_hash: string;
  issued_at: string;
  status: 'candidate' | 'superseded' | 'invalid';
  errors: string[];
  supersedes_workflow_run_id?: string;
  superseded_by_workflow_run_id?: string;
};

export type TrackRP3IntakeResult =
  | {
      ok: true;
      status: 'ready_for_independent_review';
      candidate: TrackRP3ReviewContext;
      historicalPackets: TrackRP3PacketDisposition[];
    }
  | {
      ok: false;
      status: 'blocked';
      errors: string[];
      execution_authorized: false;
    };

type VerifiedPacket = {
  registryEntry: IssuedPacketRegistryEntry;
  context: TrackRP3ReviewContext;
};

function sha256FileUtf8(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function readJsonFile<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

export function resolveSafeP3RunDirectory(args: {
  repoRoot?: string;
  workflowRunId: string;
}): { ok: true; path: string } | { ok: false; errors: string[] } {
  const runId = args.workflowRunId.trim();
  if (!WORKFLOW_RUN_ID_PATTERN.test(runId)) {
    return { ok: false, errors: [`invalid workflow_run_id: ${args.workflowRunId}`] };
  }
  const repoRoot = args.repoRoot ?? process.cwd();
  const base = resolve(repoRoot, P3_PREPARATION_RUNS_BASE);
  const resolved = resolve(base, runId);
  if (resolved !== base && !resolved.startsWith(`${base}${sep}`)) {
    return { ok: false, errors: [`run directory traversal rejected for ${args.workflowRunId}`] };
  }
  if (!existsSync(resolved)) {
    return { ok: false, errors: [`run directory missing for workflow_run_id ${runId}`] };
  }
  return { ok: true, path: resolved };
}

function assertRegistryEntryStructure(entry: IssuedPacketRegistryEntry): string[] {
  const errors: string[] = [];
  if (!entry.workflow_run_id?.trim()) errors.push('registry entry missing workflow_run_id');
  if (!entry.issued_at?.trim()) errors.push('registry entry missing issued_at');
  if (!entry.journal_id?.trim()) errors.push('registry entry missing journal_id');
  if (!entry.journal_hash?.trim()) errors.push('registry entry missing journal_hash');
  if (!entry.packet_hash?.trim()) errors.push('registry entry missing packet_hash');
  if (!entry.checked_out_commit?.trim()) errors.push('registry entry missing checked_out_commit');
  if (!entry.observed_production_commit?.trim()) {
    errors.push('registry entry missing observed_production_commit');
  }
  if (entry.preparation_only !== true) {
    errors.push('registry entry preparation_only must be true');
  }
  if (entry.execution_authorized !== false) {
    errors.push('registry entry execution_authorized must be false');
  }
  return errors;
}

function verifyOperatorPacketHash(packet: P3OperatorPacket): string[] {
  const { packet_hash: recorded, ...body } = packet;
  const recomputed = hashObject(body as Record<string, unknown>);
  if (recomputed !== recorded) {
    return [`operator packet_hash mismatch: recorded ${recorded}, recomputed ${recomputed}`];
  }
  return [];
}

function verifyMutationJournalHash(journal: BatchApplyMutationJournal): string[] {
  const recomputed = hashObject({
    journal_id: journal.journal_id,
    capture_id: journal.capture_id,
    repair_id: journal.repair_id,
    entries: journal.entries,
  });
  if (recomputed !== journal.journal_hash) {
    return [`mutation journal_hash mismatch: recorded ${journal.journal_hash}, recomputed ${recomputed}`];
  }
  return [];
}

function verifyIntendedWritesScope(intended: {
  intended_write_count: number;
  intended_block_numbers: number[];
  write_records: Array<{ key: string }>;
  execution_authorized?: boolean;
  production_mutation_performed?: boolean;
}): string[] {
  const errors: string[] = [];
  if (intended.execution_authorized !== false) {
    errors.push('intended-writes execution_authorized must be false');
  }
  if (intended.production_mutation_performed !== false) {
    errors.push('intended-writes production_mutation_performed must be false');
  }
  if (intended.intended_write_count !== 4) {
    errors.push(`intended_write_count must be exactly 4; got ${intended.intended_write_count}`);
  }
  const keys = intended.write_records.map((row) => row.key).sort();
  const expected = [...TRACK_R_P3_EXPECTED_WRITE_KEYS].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    errors.push('intended write keys must match the four staged Track R keys exactly');
  }
  if (intended.intended_block_numbers.includes(132)) {
    errors.push('intended blocks must not include position 132');
  }
  if (intended.intended_block_numbers.includes(361)) {
    errors.push('intended blocks must not include slot 361');
  }
  const maxBlock = intended.intended_block_numbers.reduce((max, value) => Math.max(max, value), 0);
  if (maxBlock > 131) {
    errors.push(`intended blocks must not extend beyond position 131; max observed ${maxBlock}`);
  }
  return errors;
}

function verifyEvidenceManifestFiles(args: {
  runDir: string;
  manifest: P3EvidenceManifest;
}): { errors: string[]; fileHashes: Record<string, string> } {
  const errors: string[] = [];
  const fileHashes: Record<string, string> = {};

  for (const [fileName, meta] of Object.entries(args.manifest.files)) {
    const filePath = join(args.runDir, fileName);
    if (!existsSync(filePath)) {
      errors.push(`evidence file missing: ${fileName}`);
      continue;
    }
    const content = readFileSync(filePath, 'utf8');
    const observed = sha256FileUtf8(content);
    fileHashes[fileName] = observed;
    if (observed !== meta.sha256) {
      errors.push(`evidence hash mismatch for ${fileName}`);
    }
  }

  return { errors, fileHashes };
}

export function verifyTrackRP3PacketEvidence(args: {
  registryEntry: IssuedPacketRegistryEntry;
  repoRoot?: string;
}): { ok: true; context: TrackRP3ReviewContext } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  errors.push(...assertRegistryEntryStructure(args.registryEntry));

  const runDirResult = resolveSafeP3RunDirectory({
    repoRoot: args.repoRoot,
    workflowRunId: args.registryEntry.workflow_run_id,
  });
  if (!runDirResult.ok) {
    return { ok: false, errors: [...errors, ...runDirResult.errors] };
  }
  const runDir = runDirResult.path;

  for (const fileName of REQUIRED_EVIDENCE_FILES) {
    if (!existsSync(join(runDir, fileName))) {
      errors.push(`required evidence file missing: ${fileName}`);
    }
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const operatorPacket = readJsonFile<P3OperatorPacket>(join(runDir, 'operator-packet.json'));
  const evidenceManifest = readJsonFile<P3EvidenceManifest>(join(runDir, 'evidence-manifest.json'));
  const mutationJournal = readJsonFile<BatchApplyMutationJournal>(join(runDir, 'mutation-journal.json'));
  const intendedWrites = readJsonFile<{
    intended_write_count: number;
    intended_block_numbers: number[];
    write_records: Array<{ key: string }>;
    execution_authorized?: boolean;
    production_mutation_performed?: boolean;
  }>(join(runDir, 'intended-writes.json'));
  const rollbackVerification = readJsonFile<{
    verified: boolean;
    execution_authorized?: boolean;
  }>(join(runDir, 'rollback-verification.json'));

  errors.push(...verifyOperatorPacketHash(operatorPacket));
  errors.push(...verifyMutationJournalHash(mutationJournal));
  errors.push(...verifyIntendedWritesScope(intendedWrites));

  const manifestCheck = verifyEvidenceManifestFiles({ runDir, manifest: evidenceManifest });
  errors.push(...manifestCheck.errors);

  if (evidenceManifest.execution_authorized !== false) {
    errors.push('evidence manifest execution_authorized must be false');
  }
  if (evidenceManifest.production_mutation_performed !== false) {
    errors.push('evidence manifest production_mutation_performed must be false');
  }
  if (evidenceManifest.workflow_run_id !== args.registryEntry.workflow_run_id) {
    errors.push('evidence manifest workflow_run_id mismatch');
  }
  if (evidenceManifest.cross_references.operator_packet_hash !== operatorPacket.packet_hash) {
    errors.push('evidence manifest operator_packet_hash mismatch');
  }
  if (evidenceManifest.cross_references.mutation_journal_id !== mutationJournal.journal_id) {
    errors.push('evidence manifest mutation_journal_id mismatch');
  }
  if (evidenceManifest.cross_references.mutation_journal_hash !== mutationJournal.journal_hash) {
    errors.push('evidence manifest mutation_journal_hash mismatch');
  }
  if (operatorPacket.packet_hash !== args.registryEntry.packet_hash) {
    errors.push('registry packet_hash mismatch');
  }
  if (mutationJournal.journal_id !== args.registryEntry.journal_id) {
    errors.push('registry journal_id mismatch');
  }
  if (mutationJournal.journal_hash !== args.registryEntry.journal_hash) {
    errors.push('registry journal_hash mismatch');
  }
  if (operatorPacket.mutation_journal_id !== mutationJournal.journal_id) {
    errors.push('operator packet mutation_journal_id mismatch');
  }
  if (operatorPacket.mutation_journal_hash !== mutationJournal.journal_hash) {
    errors.push('operator packet mutation_journal_hash mismatch');
  }

  errors.push(...assertCaptureNineBinding(operatorPacket.capture_id).errors);
  errors.push(...assertLockedHashBinding(operatorPacket.locked_hashes).errors);
  errors.push(...assertFreshCasMatch(operatorPacket.fresh_cas_match).errors);
  errors.push(...assertAwaitingExecutionHandoff(operatorPacket.readiness_status).errors);
  errors.push(...assertApplyPreflightPass(operatorPacket.preflight_status).errors);
  errors.push(...assertMutationJournalComplete(mutationJournal).errors);
  errors.push(
    ...assertProductionCommitBinding({
      checkedOutCommit: args.registryEntry.checked_out_commit,
      observedProductionCommit: args.registryEntry.observed_production_commit,
      observedEnvironment: 'production',
    }).errors,
  );
  errors.push(...assertSignedHandoffNotConsumed({ repoRoot: args.repoRoot }).errors);

  if (operatorPacket.execution_authorized !== false) {
    errors.push('operator packet execution_authorized must be false');
  }
  if (operatorPacket.production_mutation_performed !== false) {
    errors.push('operator packet production_mutation_performed must be false');
  }
  if (operatorPacket.capture_id !== CAPTURE_2014Z_ID) {
    errors.push(`operator packet capture_id must be Capture #9 (${CAPTURE_2014Z_ID})`);
  }
  if (rollbackVerification.verified !== true) {
    errors.push('rollback verification must be true');
  }
  if (rollbackVerification.execution_authorized !== false) {
    errors.push('rollback verification execution_authorized must be false');
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    context: Object.freeze({
      workflow_run_id: args.registryEntry.workflow_run_id,
      packet_hash: operatorPacket.packet_hash,
      journal_id: mutationJournal.journal_id,
      journal_hash: mutationJournal.journal_hash,
      observed_production_commit: args.registryEntry.observed_production_commit,
      capture_id: operatorPacket.capture_id,
      issued_at: args.registryEntry.issued_at,
      checked_out_commit: args.registryEntry.checked_out_commit,
      run_directory: runDir,
      operator_packet: Object.freeze(operatorPacket),
      mutation_journal: Object.freeze(mutationJournal),
      evidence_manifest: Object.freeze(evidenceManifest),
      evidence_file_hashes: Object.freeze({ ...manifestCheck.fileHashes }),
    }),
  };
}

export function runTrackRP3GovernanceIntake(args?: { repoRoot?: string }): TrackRP3IntakeResult {
  const registryResult = loadIssuedPacketRegistry(args?.repoRoot);
  if (!registryResult.ok) {
    return {
      ok: false,
      status: 'blocked',
      errors: registryResult.errors,
      execution_authorized: false,
    };
  }

  if (registryResult.registry.entries.length === 0) {
    return {
      ok: false,
      status: 'blocked',
      errors: ['no issued packets available for intake'],
      execution_authorized: false,
    };
  }

  const sortedEntries = [...registryResult.registry.entries].sort(compareIssuedPacketRegistryEntries);
  const newestEntry = sortedEntries[0];
  const newestVerification = verifyTrackRP3PacketEvidence({
    registryEntry: newestEntry,
    repoRoot: args?.repoRoot,
  });

  if (!newestVerification.ok) {
    return {
      ok: false,
      status: 'blocked',
      errors: newestVerification.errors.map(
        (detail) => `${newestEntry.workflow_run_id}: ${detail}`,
      ),
      execution_authorized: false,
    };
  }

  const verified: VerifiedPacket[] = [{ registryEntry: newestEntry, context: newestVerification.context }];
  const invalidDispositions: TrackRP3PacketDisposition[] = [];

  for (const entry of sortedEntries.slice(1)) {
    const verification = verifyTrackRP3PacketEvidence({ registryEntry: entry, repoRoot: args?.repoRoot });
    if (!verification.ok) {
      invalidDispositions.push({
        workflow_run_id: entry.workflow_run_id,
        packet_hash: entry.packet_hash,
        issued_at: entry.issued_at,
        status: 'invalid',
        errors: verification.errors,
      });
      continue;
    }
    verified.push({ registryEntry: entry, context: verification.context });
  }

  const candidate = newestVerification.context;

  const historicalPackets: TrackRP3PacketDisposition[] = [
    ...invalidDispositions,
    ...verified.slice(1).map((row) => ({
      workflow_run_id: row.registryEntry.workflow_run_id,
      packet_hash: row.registryEntry.packet_hash,
      issued_at: row.registryEntry.issued_at,
      status: 'superseded' as const,
      errors: [],
      superseded_by_workflow_run_id: candidate.workflow_run_id,
    })),
  ];

  return {
    ok: true,
    status: 'ready_for_independent_review',
    candidate,
    historicalPackets,
  };
}

export function buildTrackRP3EvidenceIdentity(context: TrackRP3ReviewContext): TrackRP3EvidenceIdentity {
  return {
    workflow_run_id: context.workflow_run_id,
    packet_hash: context.packet_hash,
    journal_id: context.journal_id,
    journal_hash: context.journal_hash,
    observed_production_commit: context.observed_production_commit,
    capture_id: context.capture_id,
    evidence_file_hashes: { ...context.evidence_file_hashes },
  };
}

export function evidenceIdentityDigest(identity: TrackRP3EvidenceIdentity): string {
  return sha256Hex(stableIdentityString(identity));
}

function stableIdentityString(identity: TrackRP3EvidenceIdentity): string {
  return hashObject({
    workflow_run_id: identity.workflow_run_id,
    packet_hash: identity.packet_hash,
    journal_id: identity.journal_id,
    journal_hash: identity.journal_hash,
    observed_production_commit: identity.observed_production_commit,
    capture_id: identity.capture_id,
    evidence_file_hashes: identity.evidence_file_hashes,
  });
}
