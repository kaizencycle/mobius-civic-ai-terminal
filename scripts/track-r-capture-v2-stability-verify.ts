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
 * Run against committed archive bytes (2026-08-17): OVERALL PASS — see
 * artifacts/C-404/track-r-lineage-v2/TRACK_R_V2_STABILITY_VERIFIER_OUTPUT.txt
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
/** This script verifies specifically the C-404 Capture #8/#9 pair — capture-a must be #8, capture-b must be #9. */
const EXPECTED_CAPTURE_ID_A = 'track-r-c403-2026-08-15T2012Z';
const EXPECTED_CAPTURE_ID_B = 'track-r-c403-2026-08-15T2014Z';

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
  const kvIdentityReceipt = (pkg.kv_identity_receipt ?? {}) as Record<string, unknown>;
  const attestationPlaceholders = (pkg.attestation_placeholders ?? {}) as Record<string, unknown>;
  const requiredHashes = (attestationPlaceholders.required_hashes ?? {}) as Record<string, unknown>;

  // attestation_hashes never carries this field — it lives on the archived
  // KV identity receipt itself, with attestation_placeholders.required_hashes
  // as a secondary cross-check. Confirmed by manual inspection of the real
  // Capture #8/#9 packages (kaizencycle) and by Bugbot/Codex review on #673.
  const kvIdentityReceiptHash =
    (kvIdentityReceipt.identity_hash as string | null) ??
    (requiredHashes.production_kv_identity_receipt_hash as string | null) ??
    null;

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

  // v2 DOES include active_lineage_version/live_canonical_pointer in the
  // hash (unlike v1's production-capture path, which hardcodes both to
  // null and is left untouched above) — production capture hashes the real
  // live pointer observation. Read it from the archived package rather than
  // assuming null; both captures happening to show null/null does not mean
  // the verifier should assume that instead of reading it.
  const recomputedV2 = computeLineageSnapshotHashV2({
    ...lineageInputCommon,
    active_lineage_version: (observedBaseline.active_lineage_version as string | null) ?? null,
    live_canonical_pointer: (observedBaseline.live_canonical_pointer as string | null) ?? null,
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
    const summary = (witnessComparison.summary ?? {}) as {
      total?: number;
      match?: number;
      mismatch?: number;
      missing?: number;
      unexpected?: number;
    };
    const exportComplete = witnessComparison.export_complete === true;
    const nonMatchRecords = records.filter((r) => r.status !== 'MATCH');
    const summaryAllMatch =
      typeof summary.total === 'number' &&
      summary.total > 0 &&
      summary.match === summary.total &&
      (summary.mismatch ?? 0) === 0 &&
      (summary.missing ?? 0) === 0 &&
      (summary.unexpected ?? 0) === 0;
    const witnessComplete =
      records.length > 0 &&
      exportComplete &&
      summaryAllMatch &&
      nonMatchRecords.length === 0 &&
      records.length === summary.total;

    checks.push({
      check: 'witness_export_complete_and_fully_matched',
      result: witnessComplete ? 'pass' : 'fail',
      detail: witnessComplete
        ? `export_complete=true, ${summary.match}/${summary.total} MATCH, 0 mismatch/missing/unexpected`
        : `export_complete=${exportComplete}, summary=${JSON.stringify(summary)}, non-MATCH records=${nonMatchRecords.length} (${nonMatchRecords.map((r) => `${r.seal_id}:${r.status}`).join(', ') || 'none'})`,
    });

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
    } else if (!witnessComplete) {
      checks.push({
        check: 'v2_execution_witness_hash',
        result: 'fail',
        detail: 'blocked by witness_export_complete_and_fully_matched failure above — an incomplete or non-matching witness must not produce a hash recommended for governance signing',
      });
    } else if (!kvIdentityReceiptHash) {
      checks.push({
        check: 'v2_execution_witness_hash',
        result: 'fail',
        detail: 'production_kv_identity_receipt hash could not be resolved from kv_identity_receipt.identity_hash or attestation_placeholders.required_hashes — refusing to compute with a null identity binding',
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
        production_kv_identity_receipt_hash: kvIdentityReceiptHash,
        active_lineage_version: (observedBaseline.active_lineage_version as string | null) ?? null,
        live_canonical_pointer: (observedBaseline.live_canonical_pointer as string | null) ?? null,
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

  console.log('\n=== Capture identity ===');
  const idsDistinct = resultA.captureId !== '' && resultB.captureId !== '' && resultA.captureId !== resultB.captureId;
  const idsMatchExpected = resultA.captureId === EXPECTED_CAPTURE_ID_A && resultB.captureId === EXPECTED_CAPTURE_ID_B;
  console.log(`Capture A ID: ${resultA.captureId} (expected ${EXPECTED_CAPTURE_ID_A})`);
  console.log(`Capture B ID: ${resultB.captureId} (expected ${EXPECTED_CAPTURE_ID_B})`);
  if (!idsDistinct) {
    console.log('✗ [fail] capture-a and capture-b resolved to the same (or an empty) capture_id — this cannot be treated as two independent stability observations. Did you pass the same directory twice?');
  } else if (!idsMatchExpected) {
    console.log('✗ [fail] capture IDs are distinct but do not match the expected Capture #8/#9 IDs for this packet');
  } else {
    console.log('✓ [pass] capture-a is Capture #8, capture-b is Capture #9, and they are distinct');
  }

  console.log('\n=== Cross-capture v2 stability ===');
  const v2Match =
    idsDistinct &&
    idsMatchExpected &&
    resultA.recomputed.lineage_snapshot_hash_v2 === resultB.recomputed.lineage_snapshot_hash_v2 &&
    resultA.recomputed.lineage_snapshot_hash_v2 === EXPECTED_V2_HASH;
  console.log(`Capture A v2: ${resultA.recomputed.lineage_snapshot_hash_v2}`);
  console.log(`Capture B v2: ${resultB.recomputed.lineage_snapshot_hash_v2}`);
  console.log(`Expected:     ${EXPECTED_V2_HASH}`);
  console.log(v2Match ? '✓ [pass] capture8.v2 == capture9.v2 == expected' : '✗ [fail] v2 hashes do not all match, or capture identity check failed above');

  const anyFail =
    resultA.checks.some((c) => c.result === 'fail') ||
    resultB.checks.some((c) => c.result === 'fail') ||
    !v2Match;

  console.log(anyFail ? '\nOVERALL: FAIL — do not proceed to governance signing' : '\nOVERALL: PASS');
  process.exit(anyFail ? 1 : 0);
}

main();
