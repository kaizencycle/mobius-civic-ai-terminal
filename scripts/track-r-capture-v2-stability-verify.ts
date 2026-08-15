#!/usr/bin/env tsx
/**
 * C-404 — Track R Capture #8/#9 v2 stability verification (read-only, offline).
 *
 * Completes the parts of the Capture #9 v2 governance packet
 * (artifacts/C-404/track-r-lineage-v2/) that could NOT be done inside the
 * session that assembled the packet, because that session's network egress
 * policy blocked downloading the two Track R Production Capture artifact
 * ZIPs from Azure blob storage. See
 * artifacts/C-404/track-r-lineage-v2/TRACK_R_V2_VERIFICATION_STATUS.md for
 * the full explanation.
 *
 * This script has NOT been executed against real artifact data as of this
 * commit — it was written against the known TRACK_R_LIVE_DRY_RUN_PACKAGE.json
 * / TRACK_R_LIVE_WITNESS_COMPARISON_REDACTED.json schema (verified by
 * reading scripts/track-r-live-dry-run-package.ts directly), not run
 * end-to-end. Field assumptions are called out inline. Run it for real once
 * the artifact ZIPs have been extracted locally, and fix anything it flags.
 *
 * Usage:
 *   pnpm exec tsx scripts/track-r-capture-v2-stability-verify.ts \
 *     --capture-a <dir containing extracted Capture #8 artifact files> \
 *     --capture-b <dir containing extracted Capture #9 artifact files>
 *
 * Zero production reads, zero writes. Operates entirely on local files.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  computeLineageSnapshotHash,
  computeLineageSnapshotHashV2,
  computeExecutionWitnessHashV2,
  hashAffectedBlockNumbers,
  loadWitnessFromFile,
  EXECUTION_WITNESS_LINEAGE_SNAPSHOT_VERSION_V2,
  type ExecutionWitnessRecordResult,
} from '@/lib/watchdog/batchRepair';

const EXPECTED_V2_HASH = 'b5f781f6992e6d000289ca130eba15d9150e7a2ce59c280384d57a2c149ef9fb';
const WITNESS_FIXTURE_PATH = 'docs/epicon/cycles/C-403/fixtures/C403_RESERVE_BLOCK_COLLISION_WITNESS.pin.json';
/** Confirmed in scripts/track-r-live-dry-run-package.ts for TRACK_R_CAPTURE_MODE=production_witness_read_only. */
const PRODUCTION_CAPTURE_ENVIRONMENT_IDENTIFIER = 'production-witness-capture-read-only';

type Args = { captureA: string; captureB: string };

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const captureA = get('--capture-a');
  const captureB = get('--capture-b');
  if (!captureA || !captureB) {
    console.error('Usage: tsx scripts/track-r-capture-v2-stability-verify.ts --capture-a <dir> --capture-b <dir>');
    process.exit(1);
  }
  return { captureA, captureB };
}

function readJson<T = Record<string, unknown>>(path: string): T {
  if (!existsSync(path)) {
    throw new Error(`missing required file: ${path}`);
  }
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

type VerifyResult = {
  captureDir: string;
  captureId: string;
  storedHashes: {
    lineage_snapshot_hash: string | null;
    lineage_snapshot_hash_v2: string | null;
    semantic_manifest_hash: string | null;
    execution_witness_hash_v1: string | null;
  };
  recomputed: {
    lineage_snapshot_hash: string | null;
    lineage_snapshot_hash_v2: string | null;
    execution_witness_hash_v2: string | null;
  };
  checks: { check: string; result: 'pass' | 'fail' | 'warn'; detail: string }[];
};

function verifyCapture(captureDir: string, pinnedBlocks: number[]): VerifyResult {
  const checks: VerifyResult['checks'] = [];
  const pkg = readJson(join(captureDir, 'TRACK_R_LIVE_DRY_RUN_PACKAGE.json'));
  const witnessComparisonPath = join(captureDir, 'TRACK_R_LIVE_WITNESS_COMPARISON_REDACTED.json');
  const witnessComparison = existsSync(witnessComparisonPath) ? readJson(witnessComparisonPath) : null;

  const captureId = String(pkg.capture_id ?? '');
  const observedBaseline = (pkg.observed_baseline ?? {}) as Record<string, unknown>;
  const pinnedEvidence = (pkg.pinned_evidence ?? {}) as Record<string, unknown>;
  const affectedComparison = (pkg.affected_block_comparison ?? {}) as Record<string, unknown>;
  const attestationHashes = (pkg.attestation_hashes ?? {}) as Record<string, unknown>;
  const executionWitness = (pkg.execution_witness ?? {}) as Record<string, unknown>;

  const missingFromLive = (affectedComparison.missing_from_live as unknown[] | undefined) ?? [];
  const unexpectedInLive = (affectedComparison.unexpected_in_live as unknown[] | undefined) ?? [];
  const exactSetMatch =
    affectedComparison.set_match === true && missingFromLive.length === 0 && unexpectedInLive.length === 0;

  if (!exactSetMatch) {
    checks.push({
      check: 'affected_block_set_reconstructable',
      result: 'fail',
      detail:
        'affected_block_comparison does not show an exact set match (missing_from_live/unexpected_in_live non-empty or set_match false) — this script cannot reconstruct the live affected-block number list from the package alone in that case. Re-derive live_affected_block_numbers_hash from the raw KV read instead.',
    });
  }
  const pinnedHash = hashAffectedBlockNumbers(pinnedBlocks);
  const liveHash = exactSetMatch ? pinnedHash : null;

  const lineageInputCommon = {
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
    pinned_affected_block_numbers_hash: pinnedHash,
    live_affected_block_numbers_hash: liveHash,
    affected_block_set_match: affectedComparison.set_match === true,
  };

  const recomputedV1 = computeLineageSnapshotHash({
    ...lineageInputCommon,
    capture_id: captureId,
    cycle: (observedBaseline.cycle as string | null) ?? null,
    active_lineage_version: null,
    live_canonical_pointer: null,
  });
  const storedV1 = (attestationHashes.lineage_snapshot_hash as string | null) ?? (pkg.attestation_placeholders as Record<string, Record<string, unknown>> | undefined)?.required_hashes?.lineage_snapshot_hash as string | undefined ?? null;
  checks.push({
    check: 'v1_lineage_hash_recompute',
    result: storedV1 && recomputedV1 === storedV1 ? 'pass' : 'fail',
    detail: `stored=${storedV1} recomputed=${recomputedV1}`,
  });

  // v2 excludes active_lineage_version/live_canonical_pointer from this
  // reconstruction because the package does not store the raw live pointer
  // observation separately from what went into the hash — if this matters,
  // re-derive from lib/watchdog/batchRepair/liveLineagePointerObservations
  // against a fresh KV read instead of trusting a package-stored value.
  const recomputedV2 = computeLineageSnapshotHashV2({
    ...lineageInputCommon,
    active_lineage_version: null,
    live_canonical_pointer: null,
  });
  const storedV2 = (attestationHashes.lineage_snapshot_hash_v2 as string | null) ?? null;
  checks.push({
    check: 'v2_lineage_hash_recompute',
    result: storedV2 && recomputedV2 === storedV2 ? 'pass' : 'fail',
    detail: `stored=${storedV2} recomputed=${recomputedV2}`,
  });
  checks.push({
    check: 'v2_lineage_hash_matches_expected_pinned_value',
    result: recomputedV2 === EXPECTED_V2_HASH ? 'pass' : 'fail',
    detail: `expected=${EXPECTED_V2_HASH} recomputed=${recomputedV2}`,
  });

  let executionWitnessHashV2: string | null = null;
  if (!witnessComparison) {
    checks.push({
      check: 'v2_execution_witness_hash',
      result: 'fail',
      detail: 'TRACK_R_LIVE_WITNESS_COMPARISON_REDACTED.json not found next to the package — cannot recompute',
    });
  } else {
    const records = (witnessComparison.records ?? []) as ExecutionWitnessRecordResult[];
    if (records.length === 0) {
      checks.push({
        check: 'v2_execution_witness_hash',
        result: 'fail',
        detail: 'witness comparison records array is empty — cannot recompute',
      });
    } else if (!exactSetMatch) {
      checks.push({
        check: 'v2_execution_witness_hash',
        result: 'fail',
        detail: 'blocked by affected_block_set_reconstructable failure above',
      });
    } else {
      executionWitnessHashV2 = computeExecutionWitnessHashV2({
        schema_version: '1.0',
        lineage_snapshot_version: EXECUTION_WITNESS_LINEAGE_SNAPSHOT_VERSION_V2,
        semantic_manifest_hash: String(attestationHashes.semantic_manifest_hash ?? ''),
        source_audit_hash: String(pinnedEvidence.witness_audit_hash ?? ''),
        lineage_snapshot_hash_v2: recomputedV2,
        expected_seal_ids: records.map((r) => r.seal_id),
        per_record_results: records,
        live_affected_block_numbers: pinnedBlocks,
        pinned_affected_block_numbers: pinnedBlocks,
        export_source: String(executionWitness.export_source ?? ''),
        environment_identifier: PRODUCTION_CAPTURE_ENVIRONMENT_IDENTIFIER,
        production_kv_identity_receipt_hash:
          (attestationHashes.production_kv_identity_receipt_hash as string | null) ?? null,
        active_lineage_version: null,
        live_canonical_pointer: null,
      });
      checks.push({
        check: 'v2_execution_witness_hash',
        result: 'pass',
        detail: `computed=${executionWitnessHashV2} — this is NEW material (no stored v2 witness hash exists yet to compare against); bind this value into the human consent template's execution_witness_hash field`,
      });
    }
  }

  return {
    captureDir,
    captureId,
    storedHashes: {
      lineage_snapshot_hash: storedV1,
      lineage_snapshot_hash_v2: storedV2,
      semantic_manifest_hash: (attestationHashes.semantic_manifest_hash as string | null) ?? null,
      execution_witness_hash_v1: (attestationHashes.execution_witness_hash as string | null) ?? null,
    },
    recomputed: {
      lineage_snapshot_hash: recomputedV1,
      lineage_snapshot_hash_v2: recomputedV2,
      execution_witness_hash_v2: executionWitnessHashV2,
    },
    checks,
  };
}

function printReport(label: string, result: VerifyResult): void {
  console.log(`\n=== ${label}: ${result.captureDir} ===`);
  console.log(`Capture ID: ${result.captureId}`);
  for (const check of result.checks) {
    const mark = check.result === 'pass' ? '✓' : check.result === 'warn' ? '⚠' : '✗';
    console.log(`${mark} [${check.result}] ${check.check}`);
    console.log(`  ${check.detail}`);
  }
}

function main(): void {
  const { captureA, captureB } = parseArgs(process.argv.slice(2));
  const witness = loadWitnessFromFile(join(process.cwd(), WITNESS_FIXTURE_PATH));
  const pinnedBlocks = witness.contested_block_numbers;

  const resultA = verifyCapture(captureA, pinnedBlocks);
  const resultB = verifyCapture(captureB, pinnedBlocks);

  printReport('Capture A', resultA);
  printReport('Capture B', resultB);

  console.log('\n=== Cross-capture v2 stability ===');
  const v2Match =
    resultA.recomputed.lineage_snapshot_hash_v2 === resultB.recomputed.lineage_snapshot_hash_v2 &&
    resultA.recomputed.lineage_snapshot_hash_v2 === EXPECTED_V2_HASH;
  console.log(`Capture A v2: ${resultA.recomputed.lineage_snapshot_hash_v2}`);
  console.log(`Capture B v2: ${resultB.recomputed.lineage_snapshot_hash_v2}`);
  console.log(`Expected:     ${EXPECTED_V2_HASH}`);
  console.log(v2Match ? '✓ [pass] capture8.v2 == capture9.v2 == expected' : '✗ [fail] v2 hashes do not all match');

  const anyFail =
    resultA.checks.some((c) => c.result === 'fail') ||
    resultB.checks.some((c) => c.result === 'fail') ||
    !v2Match;

  console.log(anyFail ? '\nOVERALL: FAIL — do not proceed to governance signing' : '\nOVERALL: PASS');
  process.exit(anyFail ? 1 : 0);
}

main();
