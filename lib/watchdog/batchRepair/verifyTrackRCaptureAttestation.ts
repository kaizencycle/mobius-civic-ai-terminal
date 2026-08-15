import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildBatchManifest,
  buildFixtureSealsFromWitness,
  computeExecutionWitnessHash,
  computeLineageSnapshotHash,
  computeProductionKvIdentityHash,
  computeTelemetrySnapshotHash,
  hashAffectedBlockNumbers,
  hashObject,
  loadProductionWitnessSealHashPin,
  loadResolutionTableFromFile,
  loadWitnessFromFile,
  verifyManifestHash,
  type ExecutionWitnessRecordResult,
} from '@/lib/watchdog/batchRepair';
import type { CollisionRepairBatchManifest } from '@/lib/watchdog/batchRepair/types';

export const CAPTURE_0123Z_ID = 'track-r-c403-2026-08-15T0123Z' as const;

export const CAPTURE_0123Z_EXPECTED_HASHES = {
  semantic_manifest_hash: '27c94b0f5b4e870ca3ba353368a8b11e5001166cbd3baee37cb11ea6a47b3eaa',
  lineage_snapshot_hash: '3db4832725df8d3d49942e60dc9ddd00d436fdb741329362b6eb4d6753669af5',
  execution_witness_hash: 'f35ef3c048cbf2f8ea93d4b29cd10c193627aaa1ce17b6cf3b50374348052867',
  rollback_manifest_hash: '0a61a3ff9cd98eb8606dee9040b963b27bec5bd8cacd175977badd378ebf0d8d',
  production_kv_identity_receipt_hash: 'fc84f950ed17d3863e2f7d24eac6eb3c54a7434913a47aa49c7374cce296726e',
  production_witness_seal_hash_pin_hash: '3876419a2ff46df126b0b956bca96ddfc21b45d5c9f1ab3d8e21bfaa4c5f9b5e',
  telemetry_snapshot_hash: '78810c63e7a5d7a98455dcbe313ce9109952a9d3a5a07383cfcc6810923cb748',
} as const;

export type TrackRCaptureAttestationCheck = {
  check: string;
  result: 'pass' | 'fail' | 'warn';
  detail: string;
};

export type TrackRCaptureAttestationVerification = {
  capture_id: string;
  archive_path: string;
  verified_at: string;
  verification_status: 'adopt_ready' | 'blocked';
  checks: TrackRCaptureAttestationCheck[];
  expected_hashes: typeof CAPTURE_0123Z_EXPECTED_HASHES;
  recomputed_hashes: Record<string, string | null>;
};

function readJson<T = Record<string, unknown>>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function addCheck(
  checks: TrackRCaptureAttestationCheck[],
  check: string,
  result: TrackRCaptureAttestationCheck['result'],
  detail: string,
): void {
  checks.push({ check, result, detail });
}

function compareHash(
  checks: TrackRCaptureAttestationCheck[],
  label: string,
  expected: string | null | undefined,
  recomputed: string | null,
): void {
  if (!expected) {
    addCheck(checks, label, 'fail', 'expected hash missing from capture bundle');
    return;
  }
  if (!recomputed) {
    addCheck(checks, label, 'fail', `could not recompute ${label}`);
    return;
  }
  addCheck(
    checks,
    label,
    recomputed === expected ? 'pass' : 'fail',
    recomputed === expected
      ? `${label}=${expected}`
      : `${label} mismatch expected=${expected} recomputed=${recomputed}`,
  );
}

function rebuildManifestFromFixtures(createdAt: string): CollisionRepairBatchManifest {
  const witness = loadWitnessFromFile(
    join(process.cwd(), 'docs/epicon/cycles/C-403/fixtures/C403_RESERVE_BLOCK_COLLISION_WITNESS.pin.json'),
  );
  const table = loadResolutionTableFromFile(
    join(process.cwd(), 'docs/epicon/cycles/C-403/fixtures/C403_COLLISION_RESOLUTION_TABLE.pin.json'),
  );
  const seals = buildFixtureSealsFromWitness(witness, table);
  return buildBatchManifest({
    witness,
    resolutionTable: table,
    seals,
    created_at: createdAt,
  });
}

export function verifyTrackRCaptureAttestation(args?: {
  archivePath?: string;
  verifiedAt?: string;
}): TrackRCaptureAttestationVerification {
  const archivePath =
    args?.archivePath ??
    join(process.cwd(), 'artifacts/C-403/track-r-live-dry-run/history/capture-0123Z');
  const verifiedAt = args?.verifiedAt ?? new Date().toISOString();
  const checks: TrackRCaptureAttestationCheck[] = [];
  const recomputed_hashes: Record<string, string | null> = {};

  const requiredFiles = [
    'TRACK_R_LIVE_DRY_RUN_PACKAGE.json',
    'TRACK_R_LIVE_WITNESS_COMPARISON_REDACTED.json',
    'TRACK_R_MANIFEST_REDACTED.json',
    'TRACK_R_ROLLBACK_MANIFEST.json',
    'TRACK_R_KV_IDENTITY_RECEIPT.json',
    'CAPTURE_PROVENANCE.json',
  ];
  for (const file of requiredFiles) {
    const full = join(archivePath, file);
    addCheck(
      checks,
      `artifact:${file}`,
      existsSync(full) ? 'pass' : 'fail',
      existsSync(full) ? full : `missing ${full}`,
    );
  }

  const pkg = readJson(join(archivePath, 'TRACK_R_LIVE_DRY_RUN_PACKAGE.json'));
  const witnessComparison = readJson(join(archivePath, 'TRACK_R_LIVE_WITNESS_COMPARISON_REDACTED.json'));
  const rollbackManifest = readJson(join(archivePath, 'TRACK_R_ROLLBACK_MANIFEST.json'));
  const kvReceipt = readJson(join(archivePath, 'TRACK_R_KV_IDENTITY_RECEIPT.json'));
  const provenance = readJson(join(archivePath, 'CAPTURE_PROVENANCE.json'));
  const placeholders = (pkg.attestation_placeholders ?? {}) as Record<string, unknown>;
  const requiredHashes = (placeholders.required_hashes ?? {}) as Record<string, string>;

  const captureId = String(pkg.capture_id ?? '');
  addCheck(
    checks,
    'capture_id',
    captureId === CAPTURE_0123Z_ID ? 'pass' : 'fail',
    captureId,
  );
  addCheck(
    checks,
    'executive_status',
    pkg.executive_status === 'READY_FOR_ZEUS_EVE_REVIEW' ? 'pass' : 'fail',
    String(pkg.executive_status ?? 'missing'),
  );
  addCheck(
    checks,
    'process_exit_code',
    pkg.process_exit_code === 0 ? 'pass' : 'fail',
    String(pkg.process_exit_code ?? 'missing'),
  );
  addCheck(
    checks,
    'production_mutation_performed',
    pkg.production_mutation_performed === false ? 'pass' : 'fail',
    String(pkg.production_mutation_performed ?? 'missing'),
  );
  addCheck(
    checks,
    'execution_authorized',
    pkg.execution_authorized === false ? 'pass' : 'fail',
    String(pkg.execution_authorized ?? 'missing'),
  );

  const pinLoad = loadProductionWitnessSealHashPin();
  recomputed_hashes.production_witness_seal_hash_pin_hash = pinLoad.ok ? pinLoad.pin_hash : null;
  compareHash(
    checks,
    'production_witness_seal_hash_pin_hash',
    requiredHashes.production_witness_seal_hash_pin_hash,
    recomputed_hashes.production_witness_seal_hash_pin_hash,
  );

  const rebuiltManifest = rebuildManifestFromFixtures(String(pkg.captured_at ?? verifiedAt));
  recomputed_hashes.semantic_manifest_hash = rebuiltManifest.manifest_hash;
  compareHash(
    checks,
    'semantic_manifest_hash',
    requiredHashes.semantic_manifest_hash,
    recomputed_hashes.semantic_manifest_hash,
  );
  addCheck(
    checks,
    'semantic_manifest_verifyManifestHash',
    verifyManifestHash(rebuiltManifest) ? 'pass' : 'fail',
    rebuiltManifest.manifest_hash,
  );

  const observedBaseline = (pkg.observed_baseline ?? {}) as Record<string, unknown>;
  const affectedComparison = (pkg.affected_block_comparison ?? {}) as Record<string, unknown>;
  const pinnedEvidence = (pkg.pinned_evidence ?? {}) as Record<string, unknown>;
  const witness = loadWitnessFromFile(
    join(process.cwd(), 'docs/epicon/cycles/C-403/fixtures/C403_RESERVE_BLOCK_COLLISION_WITNESS.pin.json'),
  );
  const pinnedBlocks = witness.contested_block_numbers;
  const liveBlocks = (observedBaseline.affected_block_numbers as number[] | undefined) ?? [];

  recomputed_hashes.lineage_snapshot_hash = computeLineageSnapshotHash({
    capture_id: captureId,
    cycle: (observedBaseline.cycle as string | null) ?? null,
    latest_attested_seal: (observedBaseline.latest_attested_seal as string | null) ?? null,
    attested_seal_index: (observedBaseline.attested_seal_index as number | null) ?? null,
    projected_next_sequence: (observedBaseline.projected_next_sequence as number | null) ?? null,
    historical_collision_pairs: (observedBaseline.historical_collision_pairs as number | null) ?? null,
    contested_block_positions:
      (affectedComparison.live_contested_count as number | null) ??
      (observedBaseline.contested_block_positions as number | null) ??
      0,
    uncontested_positions: (observedBaseline.uncontested_positions as number | null) ?? 0,
    canonical_reserve_blocks: observedBaseline.canonical_reserve_blocks ?? null,
    integrity_gate_active: observedBaseline.integrity_gate_active as boolean | null,
    reserve_block_lane: (observedBaseline.reserve_block_lane as string | null) ?? null,
    candidate_formation_blocked: observedBaseline.candidate_formation_blocked as boolean | null,
    witness_audit_hash: String(pinnedEvidence.witness_audit_hash ?? ''),
    resolution_table_hash: String(pinnedEvidence.resolution_table_hash ?? ''),
    active_lineage_version: null,
    live_canonical_pointer: null,
    pinned_affected_block_numbers_hash: hashAffectedBlockNumbers(pinnedBlocks),
    live_affected_block_numbers_hash: liveBlocks.length > 0 ? hashAffectedBlockNumbers(liveBlocks) : null,
    affected_block_set_match: affectedComparison.set_match === true,
  });
  compareHash(
    checks,
    'lineage_snapshot_hash',
    requiredHashes.lineage_snapshot_hash,
    recomputed_hashes.lineage_snapshot_hash,
  );

  recomputed_hashes.telemetry_snapshot_hash = computeTelemetrySnapshotHash({
    capture_id: captureId,
    unsealed_accumulator_mic: (observedBaseline.unsealed_accumulator_mic as number | null) ?? null,
    gi_current: observedBaseline.gi_current,
    health_status: observedBaseline.health_status,
    kv_available: (observedBaseline.kv_available as boolean | null) ?? null,
    latest_sealed_at: observedBaseline.latest_sealed_at,
  });
  compareHash(
    checks,
    'telemetry_snapshot_hash',
    requiredHashes.telemetry_snapshot_hash,
    recomputed_hashes.telemetry_snapshot_hash,
  );

  recomputed_hashes.production_kv_identity_receipt_hash = computeProductionKvIdentityHash(
    kvReceipt.anchor_results as Parameters<typeof computeProductionKvIdentityHash>[0],
  );
  compareHash(
    checks,
    'production_kv_identity_receipt_hash',
    requiredHashes.production_kv_identity_receipt_hash,
    recomputed_hashes.production_kv_identity_receipt_hash,
  );
  addCheck(
    checks,
    'kv_identity_status',
    kvReceipt.identity_status === 'PRODUCTION_KV_IDENTITY_CONFIRMED' ? 'pass' : 'fail',
    String(kvReceipt.identity_status ?? 'missing'),
  );

  recomputed_hashes.rollback_manifest_hash = hashObject(
    rollbackManifest as Record<string, unknown>,
  );
  compareHash(
    checks,
    'rollback_manifest_hash',
    requiredHashes.rollback_manifest_hash,
    recomputed_hashes.rollback_manifest_hash,
  );

  const perRecordResults = ((witnessComparison.records ?? []) as ExecutionWitnessRecordResult[]).map(
    (record) => ({
      seal_id: record.seal_id,
      status: record.status,
      block_number: record.block_number,
      live_kv_hash: record.live_kv_hash,
      pinned_witness_hash: record.pinned_witness_hash,
    }),
  );
  const summary = witnessComparison.summary as Record<string, number> | undefined;
  addCheck(
    checks,
    'live_witness_summary',
    summary?.match === 248 &&
      summary?.mismatch === 0 &&
      summary?.missing === 0 &&
      summary?.unexpected === 0
      ? 'pass'
      : 'fail',
    JSON.stringify(summary ?? {}),
  );
  addCheck(
    checks,
    'comparison_mode',
    witnessComparison.comparison_mode === 'pinned_production_witness_seal_hashes' ? 'pass' : 'fail',
    String(witnessComparison.comparison_mode ?? 'missing'),
  );
  addCheck(
    checks,
    'affected_block_set_match',
    affectedComparison.set_match === true ? 'pass' : 'fail',
    JSON.stringify({
      set_match: affectedComparison.set_match,
      pinned: affectedComparison.pinned_contested_count,
      live: affectedComparison.live_contested_count,
    }),
  );
  addCheck(
    checks,
    'boundary_41_42',
    (pkg.live_boundary_41_42 as Record<string, unknown> | undefined)?.status === 'pass'
      ? 'pass'
      : 'fail',
    String((pkg.live_boundary_41_42 as Record<string, unknown> | undefined)?.status ?? 'missing'),
  );
  addCheck(
    checks,
    'boundary_131_132',
    (pkg.boundaries as Record<string, unknown> | undefined)?.['131->132'] ===
      'pending_track_r_step_8'
      ? 'pass'
      : 'fail',
    String((pkg.boundaries as Record<string, unknown> | undefined)?.['131->132'] ?? 'missing'),
  );
  addCheck(
    checks,
    'governance131_cutoff',
    (pkg.governance131_cutoff as Record<string, unknown> | undefined)?.ok === true ? 'pass' : 'fail',
    String((pkg.governance131_cutoff as Record<string, unknown> | undefined)?.status ?? 'missing'),
  );

  const executionWitness = (pkg.execution_witness ?? {}) as Record<string, unknown>;
  recomputed_hashes.execution_witness_hash = computeExecutionWitnessHash({
    schema_version: '1.0',
    semantic_manifest_hash: rebuiltManifest.manifest_hash,
    source_audit_hash: rebuiltManifest.source_audit_hash,
    lineage_snapshot_hash: recomputed_hashes.lineage_snapshot_hash ?? '',
    expected_seal_ids: perRecordResults.map((record) => record.seal_id),
    per_record_results: perRecordResults,
    live_affected_block_numbers: liveBlocks,
    pinned_affected_block_numbers: pinnedBlocks,
    export_source: String(executionWitness.export_source ?? witnessComparison.export_source ?? ''),
    environment_identifier: String(
      observedBaseline.environment ?? 'production-witness-capture-read-only',
    ),
    production_kv_identity_receipt_hash: recomputed_hashes.production_kv_identity_receipt_hash,
    active_lineage_version: null,
    live_canonical_pointer: null,
  });
  compareHash(
    checks,
    'execution_witness_hash',
    requiredHashes.execution_witness_hash,
    recomputed_hashes.execution_witness_hash,
  );

  for (const [key, expected] of Object.entries(CAPTURE_0123Z_EXPECTED_HASHES)) {
    const actual = requiredHashes[key];
    addCheck(
      checks,
      `provenance_crosscheck:${key}`,
      actual === expected ? 'pass' : 'fail',
      `package=${actual ?? 'missing'} provenance=${String((provenance.required_hashes as Record<string, string> | undefined)?.[key] ?? 'missing')} expected=${expected}`,
    );
  }

  const verification_status = checks.every((row) => row.result !== 'fail')
    ? 'adopt_ready'
    : 'blocked';

  return {
    capture_id: captureId,
    archive_path: archivePath,
    verified_at: verifiedAt,
    verification_status,
    checks,
    expected_hashes: CAPTURE_0123Z_EXPECTED_HASHES,
    recomputed_hashes,
  };
}
