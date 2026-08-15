#!/usr/bin/env tsx
/**
 * Field-level three-way lineage CAS comparison for Track R governance investigation.
 *
 * Compares Capture #5 (0123Z), simulated 16:56 preflight input, and Capture #6 (1706Z).
 * Recomputes hashes with normalization to isolate volatile vs structural drift.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  computeLineageSnapshotHash,
  type LineageSnapshotInput,
} from '@/lib/watchdog/batchRepair/snapshotIdentity';
import { hashAffectedBlockNumbers as hashBlocks } from '@/lib/watchdog/batchRepair/affectedBlockComparison';

type PackageJson = Record<string, unknown>;

const CAPTURE5_PATH =
  'artifacts/C-403/track-r-live-dry-run/history/capture-0123Z/TRACK_R_LIVE_DRY_RUN_PACKAGE.json';
const CAPTURE6_PATH = process.argv[2] ?? '/tmp/capture6/track-r-production-capture/TRACK_R_LIVE_DRY_RUN_PACKAGE.json';

const ATTESTED_CAPTURE_ID = 'track-r-c403-2026-08-15T0123Z';
const PREFLIGHT_FRESH_HASH = 'd0880d2936f4ffffc1d783cc6601f557abcb31a559671f838b930e9b7d7f8845';

function loadPackage(path: string): PackageJson {
  return JSON.parse(readFileSync(join(process.cwd(), path), 'utf8')) as PackageJson;
}

function loadPackageAbs(path: string): PackageJson {
  return JSON.parse(readFileSync(path, 'utf8')) as PackageJson;
}

/** Capture-path lineage input (matches buildTrackREvidencePackage / verifyTrackRCaptureAttestation). */
function lineageFromCapturePackage(
  pkg: PackageJson,
  options?: { capture_id?: string; cycle?: string | null },
): LineageSnapshotInput {
  const captureId = options?.capture_id ?? String(pkg.capture_id ?? '');
  const observed = (pkg.observed_baseline ?? {}) as Record<string, unknown>;
  const affected = (pkg.affected_block_comparison ?? {}) as Record<string, unknown>;
  const pinned = (pkg.pinned_evidence ?? {}) as Record<string, unknown>;
  const liveBlocks =
    (affected.live_block_numbers as number[] | undefined) ??
    (observed.affected_block_numbers as number[] | undefined) ??
    [];

  return {
    capture_id: captureId,
    cycle: options?.cycle ?? ((observed.cycle as string | null) ?? null),
    latest_attested_seal: (observed.latest_attested_seal as string | null) ?? null,
    attested_seal_index: (observed.attested_seal_index as number | null) ?? null,
    projected_next_sequence: (observed.projected_next_sequence as number | null) ?? null,
    historical_collision_pairs: (observed.historical_collision_pairs as number | null) ?? null,
    contested_block_positions:
      (affected.live_contested_count as number | null) ??
      (observed.contested_block_positions as number | null) ??
      0,
    uncontested_positions: (observed.uncontested_positions as number | null) ?? 0,
    canonical_reserve_blocks: observed.canonical_reserve_blocks ?? null,
    integrity_gate_active: observed.integrity_gate_active as boolean | null,
    reserve_block_lane: (observed.reserve_block_lane as string | null) ?? null,
    candidate_formation_blocked: observed.candidate_formation_blocked as boolean | null,
    witness_audit_hash: String(pinned.witness_audit_hash ?? ''),
    resolution_table_hash: String(pinned.resolution_table_hash ?? ''),
    active_lineage_version: null,
    live_canonical_pointer: null,
    pinned_affected_block_numbers_hash: hashBlocks(
      (pinned.contested_positions_pinned as number | undefined)
        ? Array.from({ length: pinned.contested_positions_pinned as number }, (_, i) => i + 1)
        : [],
    ),
    live_affected_block_numbers_hash:
      liveBlocks.length > 0 ? hashBlocks(liveBlocks) : null,
    affected_block_set_match: affected.set_match === true,
  };
}

/** Preflight-path lineage input (matches computeFreshLineageSnapshotFromProduction). */
function lineageFromPreflightSimulation(
  observedBaseline: Record<string, unknown>,
  witnessContestedBlocks: number[],
  options: {
    capture_id: string;
    witness_audit_hash: string;
    resolution_table_hash: string;
    active_lineage_version?: string | null;
    live_canonical_pointer?: string | null;
    authoritativeLiveBlocks: number[] | null;
    affectedBlockComparison: Record<string, unknown>;
  },
): LineageSnapshotInput {
  const authoritativeLiveBlocks = options.authoritativeLiveBlocks;

  return {
    capture_id: options.capture_id,
    cycle: (observedBaseline.cycle as string | null) ?? null,
    latest_attested_seal: (observedBaseline.latest_attested_seal as string | null) ?? null,
    attested_seal_index: (observedBaseline.attested_seal_index as number | null) ?? null,
    projected_next_sequence: (observedBaseline.projected_next_sequence as number | null) ?? null,
    historical_collision_pairs: (observedBaseline.historical_collision_pairs as number | null) ?? null,
    contested_block_positions:
      (options.affectedBlockComparison.live_contested_count as number | null) ??
      (observedBaseline.contested_block_positions as number | null) ??
      0,
    uncontested_positions: (observedBaseline.uncontested_positions as number | null) ?? 0,
    canonical_reserve_blocks: observedBaseline.canonical_reserve_blocks ?? null,
    integrity_gate_active: observedBaseline.integrity_gate_active as boolean | null,
    reserve_block_lane: (observedBaseline.reserve_block_lane as string | null) ?? null,
    candidate_formation_blocked: observedBaseline.candidate_formation_blocked as boolean | null,
    witness_audit_hash: options.witness_audit_hash,
    resolution_table_hash: options.resolution_table_hash,
    active_lineage_version: options.active_lineage_version ?? null,
    live_canonical_pointer: options.live_canonical_pointer ?? null,
    pinned_affected_block_numbers_hash: hashBlocks(witnessContestedBlocks),
    live_affected_block_numbers_hash: authoritativeLiveBlocks
      ? hashBlocks(authoritativeLiveBlocks)
      : null,
    affected_block_set_match: options.affectedBlockComparison.set_match === true,
  };
}

function pinnedBlocksFromPackage(pkg: PackageJson): number[] {
  const observed = (pkg.observed_baseline ?? {}) as Record<string, unknown>;
  return (observed.affected_block_numbers as number[] | undefined) ?? [];
}

function hashLineage(input: LineageSnapshotInput): string {
  return computeLineageSnapshotHash(input);
}

function diffFields(
  a: LineageSnapshotInput,
  b: LineageSnapshotInput,
): Array<{ field: keyof LineageSnapshotInput; a: unknown; b: unknown }> {
  const keys = Object.keys(a) as Array<keyof LineageSnapshotInput>;
  const diffs: Array<{ field: keyof LineageSnapshotInput; a: unknown; b: unknown }> = [];
  for (const field of keys) {
    const av = JSON.stringify(a[field]);
    const bv = JSON.stringify(b[field]);
    if (av !== bv) {
      diffs.push({ field, a: a[field], b: b[field] });
    }
  }
  return diffs;
}

function printSection(title: string): void {
  console.log(`\n${'='.repeat(72)}\n${title}\n${'='.repeat(72)}`);
}

function main(): void {
  const capture5 = loadPackage(CAPTURE5_PATH);
  const capture6 = loadPackageAbs(CAPTURE6_PATH);

  const capture5Lineage = lineageFromCapturePackage(capture5);
  // Fix pinned hash — use witness pin count from package evidence path
  const pinned5 = (capture5.pinned_evidence ?? {}) as Record<string, unknown>;
  capture5Lineage.pinned_affected_block_numbers_hash = hashBlocks(
    JSON.parse(
      readFileSync(
        join(
          process.cwd(),
          'docs/epicon/cycles/C-403/fixtures/C403_RESERVE_BLOCK_COLLISION_WITNESS.pin.json',
        ),
        'utf8',
      ),
    ).contested_block_numbers as number[],
  );

  const capture6Lineage = lineageFromCapturePackage(capture6);
  capture6Lineage.pinned_affected_block_numbers_hash = capture5Lineage.pinned_affected_block_numbers_hash;

  const witnessBlocks = JSON.parse(
    readFileSync(
      join(
        process.cwd(),
        'docs/epicon/cycles/C-403/fixtures/C403_RESERVE_BLOCK_COLLISION_WITNESS.pin.json',
      ),
      'utf8',
    ),
  ).contested_block_numbers as number[];

  const capture6Observed = (capture6.observed_baseline ?? {}) as Record<string, unknown>;
  const capture6Affected = (capture6.affected_block_comparison ?? {}) as Record<string, unknown>;
  const pinned6 = (capture6.pinned_evidence ?? {}) as Record<string, unknown>;

  // Simulate 16:56 preflight: attested capture_id + production baseline at Capture #6 time
  // (seal bodies unchanged; cycle already C-404 by 17:06, likely same at 16:56)
  const preflightSim = lineageFromPreflightSimulation(capture6Observed, witnessBlocks, {
    capture_id: ATTESTED_CAPTURE_ID,
    witness_audit_hash: String(pinned6.witness_audit_hash ?? ''),
    resolution_table_hash: String(pinned6.resolution_table_hash ?? ''),
    active_lineage_version: null,
    live_canonical_pointer: null,
    authoritativeLiveBlocks: pinnedBlocksFromPackage(capture6),
    affectedBlockComparison: capture6Affected,
  });

  const capture5Hash = hashLineage(capture5Lineage);
  const capture6Hash = hashLineage(capture6Lineage);
  const preflightSimHash = hashLineage(preflightSim);

  printSection('Observed lineage snapshot hashes');
  console.log(
    JSON.stringify(
      {
        capture5_attested: {
          capture_id: capture5.capture_id,
          stored: (capture5.attestation_hashes as Record<string, string>).lineage_snapshot_hash,
          recomputed: capture5Hash,
          match:
            (capture5.attestation_hashes as Record<string, string>).lineage_snapshot_hash ===
            capture5Hash,
        },
        preflight_1656Z_reported: PREFLIGHT_FRESH_HASH,
        preflight_sim_from_capture6_baseline: preflightSimHash,
        preflight_sim_matches_reported: preflightSimHash === PREFLIGHT_FRESH_HASH,
        capture6: {
          capture_id: capture6.capture_id,
          stored: (capture6.attestation_hashes as Record<string, string>).lineage_snapshot_hash,
          recomputed: capture6Hash,
          match:
            (capture6.attestation_hashes as Record<string, string>).lineage_snapshot_hash ===
            capture6Hash,
        },
      },
      null,
      2,
    ),
  );

  printSection('Capture #5 vs Capture #6 — field diffs (capture path)');
  const c5v6 = diffFields(capture5Lineage, capture6Lineage);
  for (const d of c5v6) {
    console.log(`- ${d.field}: ${JSON.stringify(d.a)} → ${JSON.stringify(d.b)}`);
  }

  printSection('Simulated preflight (16:56) vs Capture #6 — field diffs');
  const pf6 = diffFields(preflightSim, capture6Lineage);
  for (const d of pf6) {
    console.log(`- ${d.field}: ${JSON.stringify(d.a)} → ${JSON.stringify(d.b)}`);
  }

  printSection('Normalization experiments — isolate volatile fields');
  const experiments = [
    {
      label: 'Capture #6 with attested capture_id (0123Z)',
      input: { ...capture6Lineage, capture_id: ATTESTED_CAPTURE_ID },
    },
    {
      label: 'Capture #5 with C-404 cycle label',
      input: { ...capture5Lineage, cycle: 'C-404' },
    },
    {
      label: 'Capture #5 with C-404 + attested capture_id unchanged',
      input: { ...capture5Lineage, cycle: 'C-404' },
    },
    {
      label: 'Lineage core only (exclude capture_id + cycle)',
      input: {
        ...capture6Lineage,
        capture_id: ATTESTED_CAPTURE_ID,
        cycle: 'C-403',
      },
    },
  ];

  for (const exp of experiments) {
    console.log(`\n${exp.label}`);
    console.log(`  hash=${hashLineage(exp.input)}`);
    console.log(`  matches_preflight=${hashLineage(exp.input) === PREFLIGHT_FRESH_HASH}`);
    console.log(`  matches_capture6=${hashLineage(exp.input) === capture6Hash}`);
    console.log(`  matches_capture5=${hashLineage(exp.input) === capture5Hash}`);
  }

  printSection('Volatile-field attribution (single-field flip from Capture #5 baseline)');
  const baseline = capture5Lineage;
  const attributions: Array<{ field: keyof LineageSnapshotInput; value: unknown; hash: string }> =
    [];
  for (const field of ['capture_id', 'cycle'] as const) {
    const flipped = { ...baseline, [field]: capture6Lineage[field] };
    attributions.push({
      field,
      value: capture6Lineage[field],
      hash: hashLineage(flipped),
    });
  }
  console.log(JSON.stringify(attributions, null, 2));

  printSection('Non-lineage fields confirmed outside lineage hash');
  const obs5 = (capture5.observed_baseline ?? {}) as Record<string, unknown>;
  const obs6 = (capture6.observed_baseline ?? {}) as Record<string, unknown>;
  console.log(
    JSON.stringify(
      {
        telemetry_only_drift: {
          unsealed_accumulator_mic: { c5: obs5.unsealed_accumulator_mic, c6: obs6.unsealed_accumulator_mic },
          gi_current: { c5: obs5.gi_current, c6: obs6.gi_current },
          captured_at: { c5: capture5.captured_at, c6: capture6.captured_at },
          affected_block_audited_at: {
            c5: (capture5.affected_block_comparison as Record<string, string>)?.audited_at,
            c6: (capture6.affected_block_comparison as Record<string, string>)?.audited_at,
          },
        },
        execution_witness_hash: {
          c5: (capture5.execution_witness as Record<string, string>)?.execution_witness_hash,
          c6: (capture6.execution_witness as Record<string, string>)?.execution_witness_hash,
        },
        semantic_manifest_unchanged:
          (capture5.attestation_hashes as Record<string, string>).semantic_manifest_hash ===
          (capture6.attestation_hashes as Record<string, string>).semantic_manifest_hash,
      },
      null,
      2,
    ),
  );
}

main();
