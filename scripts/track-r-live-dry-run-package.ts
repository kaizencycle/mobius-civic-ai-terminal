#!/usr/bin/env tsx
/**
 * Track R live dry-run evidence package (read-only).
 *
 * Captures production baseline via public APIs, validates drift against handoff
 * anchors, runs the C-403 batch repair engine in dry-run mode (zero writes), and
 * emits a reviewable evidence bundle for ZEUS × EVE × human attestation.
 *
 * Usage:
 *   pnpm track-r:live-dry-run-package
 *   pnpm track-r:live-dry-run-package --base-url https://mobius-civic-ai-terminal.vercel.app
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  TRACK_R_BATCH_REPAIR_ID,
  TRACK_R_GOVERNANCE_DISPOSITION,
  TRACK_R_HISTORICAL_CONFLICT_PAIRS,
  computeWitnessAuditHash,
  computeResolutionTableHash,
  computeLineageSnapshotHash,
  computeTelemetrySnapshotHash,
  demonstrateSingleReceiptCircularDependency,
  dryRunReportHash,
  executeBatchDryRun,
  loadResolutionTableFromFile,
  loadWitnessFromFile,
  buildFixtureSealsFromWitness,
  verifyBoundaryContinuity,
  verifyManifestHash,
  validateBatchManifest,
  buildTrackREvidencePackage,
  compareAffectedBlockSets,
  resolveTrackRProcessExitCode,
  collectTrackRWitnessSealIds,
} from '@/lib/watchdog/batchRepair';
import type { CollisionAffectedBlockSnapshot } from '@/lib/vault/collision-affected-blocks';
import { hashObject } from '@/lib/watchdog/batchRepair/stableHash';
import { LINEAGE_ACTIVE_VERSION_KEY } from '@/lib/watchdog/batchRepair/versionedStaging';
import type { BatchDryRunReport, CollisionRepairBatchManifest } from '@/lib/watchdog/batchRepair/types';

const DEFAULT_BASE = 'https://mobius-civic-ai-terminal.vercel.app';
const PR653_MERGE_SHA = '100d2c4ab3559f0b7b59d6e888d74792e0b61ea2';
const WITNESS_PATH = 'docs/epicon/cycles/C-403/fixtures/C403_RESERVE_BLOCK_COLLISION_WITNESS.pin.json';
const TABLE_PATH = 'docs/epicon/cycles/C-403/fixtures/C403_COLLISION_RESOLUTION_TABLE.pin.json';
const OUT_DIR = 'artifacts/C-403/track-r-live-dry-run';

type HandoffBaseline = {
  cycle: string;
  latest_attested_seal: string;
  attested_seal_index: number;
  projected_next_sequence: number;
  historical_collision_pairs: number;
  contested_block_positions: number;
  uncontested_positions: number;
  canonical_reserve_blocks: null;
  integrity_gate_active: boolean;
  reserve_block_lane: string;
  candidate_formation_blocked: boolean;
  candidate_in_flight: false;
  unsealed_accumulator_mic_approx: number;
  pr653_merge_sha: string;
};

const HANDOFF_BASELINE: HandoffBaseline = {
  cycle: 'C-403',
  latest_attested_seal: 'seal-C-372-002',
  attested_seal_index: 360,
  projected_next_sequence: 361,
  historical_collision_pairs: 125,
  contested_block_positions: 123,
  uncontested_positions: 71,
  canonical_reserve_blocks: null,
  integrity_gate_active: true,
  reserve_block_lane: 'integrity_hold',
  candidate_formation_blocked: true,
  candidate_in_flight: false,
  unsealed_accumulator_mic_approx: 2547.905162,
  pr653_merge_sha: PR653_MERGE_SHA,
};

function buildCaptureId(isoTimestamp: string): string {
  return `track-r-c403-${isoTimestamp.replace(/[:.]/g, '').slice(0, 15)}Z`;
}

function parseArgs(argv: string[]): { baseUrl: string } {
  let baseUrl = DEFAULT_BASE;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--base-url' && argv[i + 1]) baseUrl = argv[++i].replace(/\/$/, '');
  }
  return { baseUrl };
}

async function fetchJson<T>(url: string): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> {
  try {
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(30_000) });
    const data = (await res.json()) as T;
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function redactManifestForReview(manifest: CollisionRepairBatchManifest): Record<string, unknown> {
  return {
    schema_version: manifest.schema_version,
    repair_id: manifest.repair_id,
    cycle: manifest.cycle,
    strategy: manifest.strategy,
    source_audit_hash: manifest.source_audit_hash,
    resolution_table_hash: manifest.resolution_table_hash,
    total_block_positions: manifest.total_block_positions,
    contested_positions: manifest.contested_positions,
    historical_hash_divergent_pairs: manifest.historical_hash_divergent_pairs,
    canonical_assignment_count: manifest.canonical_assignment_count,
    quarantined_conflicting_seal_count: manifest.quarantined_conflicting_seal_count,
    clean_position_count: manifest.clean_position_count,
    canonical_assignments: manifest.canonical_assignments,
    quarantined_seal_ids: manifest.quarantined_seal_ids,
    boundary_expectations: manifest.boundary_expectations,
    governance_disposition: manifest.governance_disposition,
    production_execution_enabled: manifest.production_execution_enabled,
    zeus_verdict: manifest.zeus_verdict,
    eve_verdict: manifest.eve_verdict,
    human_approval: manifest.human_approval,
    created_at: manifest.created_at,
    manifest_hash: manifest.manifest_hash,
    receipt_count: manifest.receipts.length,
    receipt_ids: manifest.receipts.map((r) => r.receipt_id),
  };
}

type DriftItem = { field: string; expected: unknown; observed: unknown; severity: 'info' | 'material' };

function compareBaseline(
  observed: Record<string, unknown>,
  liveContestedCount: number | null,
): DriftItem[] {
  const drift: DriftItem[] = [];

  const check = (field: keyof HandoffBaseline, observedValue: unknown, tolerance?: number) => {
    const expected = HANDOFF_BASELINE[field];
    if (typeof expected === 'number' && typeof observedValue === 'number' && tolerance !== undefined) {
      if (Math.abs(observedValue - expected) > tolerance) {
        drift.push({ field, expected, observed: observedValue, severity: 'info' });
      }
      return;
    }
    if (observedValue !== expected) {
      drift.push({
        field,
        expected,
        observed: observedValue,
        severity:
          field === 'historical_collision_pairs' ||
          field === 'contested_block_positions' ||
          field === 'integrity_gate_active' ||
          field === 'latest_attested_seal' ||
          field === 'attested_seal_index'
            ? 'material'
            : 'info',
      });
    }
  };

  check('cycle', observed.cycle);
  check('latest_attested_seal', observed.latest_attested_seal);
  check('attested_seal_index', observed.attested_seal_index);
  check('projected_next_sequence', observed.projected_next_sequence);
  check('historical_collision_pairs', observed.historical_collision_pairs);
  if (liveContestedCount !== null) {
    if (liveContestedCount !== HANDOFF_BASELINE.contested_block_positions) {
      drift.push({
        field: 'contested_block_positions',
        expected: HANDOFF_BASELINE.contested_block_positions,
        observed: liveContestedCount,
        severity: 'material',
      });
    }
  } else {
    drift.push({
      field: 'contested_block_positions',
      expected: HANDOFF_BASELINE.contested_block_positions,
      observed: null,
      severity: 'material',
    });
  }
  check('uncontested_positions', observed.uncontested_positions);
  check('canonical_reserve_blocks', observed.canonical_reserve_blocks);
  check('integrity_gate_active', observed.integrity_gate_active);
  check('reserve_block_lane', observed.reserve_block_lane);
  check('candidate_formation_blocked', observed.candidate_formation_blocked);
  check('candidate_in_flight', observed.candidate_in_flight);
  check('unsealed_accumulator_mic_approx', observed.unsealed_accumulator_mic, 5);

  return drift;
}

const OUT_SCHEMA = 'TRACK_R_LIVE_DRY_RUN_PACKAGE_v3';

async function main(): Promise<void> {
  const { baseUrl } = parseArgs(process.argv.slice(2));
  const captured_at = new Date().toISOString();
  const capture_id = buildCaptureId(captured_at);
  const receipt_created_at = captured_at;

  mkdirSync(OUT_DIR, { recursive: true });

  const witness = loadWitnessFromFile(WITNESS_PATH);
  const table = loadResolutionTableFromFile(TABLE_PATH);

  const [vaultStatus, sealStatus, health] = await Promise.all([
    fetchJson<Record<string, unknown>>(`${baseUrl}/api/vault/status`),
    fetchJson<Record<string, unknown>>(`${baseUrl}/api/vault/seal-status`),
    fetchJson<Record<string, unknown>>(`${baseUrl}/api/health`),
  ]);

  const failures: string[] = [];
  if (!vaultStatus.ok || !vaultStatus.data) failures.push(`vault/status HTTP ${vaultStatus.status}`);
  if (!sealStatus.ok || !sealStatus.data) failures.push(`vault/seal-status HTTP ${sealStatus.status}`);
  if (!health.ok || !health.data) failures.push(`health HTTP ${health.status}`);

  const vs = vaultStatus.data ?? {};
  const ss = sealStatus.data ?? {};
  const rt = (vs.reserve_block_truth ?? {}) as Record<string, unknown>;
  const ig = (rt.integrity_gate ?? {}) as Record<string, unknown>;
  const acc = (rt.accumulator ?? {}) as Record<string, unknown>;
  const rb = (vs.reserve_block ?? {}) as Record<string, unknown>;

  const collisionAffectedBlocks = (rt.collision_affected_blocks ??
    null) as CollisionAffectedBlockSnapshot | null;
  const liveAffectedBlockNumbers = collisionAffectedBlocks?.affected_block_numbers ?? null;
  const liveContestedCount = liveAffectedBlockNumbers?.length ?? null;

  const observed = {
    capture_id,
    capture_sources: {
      vault_status: `${baseUrl}/api/vault/status`,
      seal_status: `${baseUrl}/api/vault/seal-status`,
      health: `${baseUrl}/api/health`,
    },
    captured_at,
    environment: 'cursor-cloud-agent',
    pr653_merge_sha: PR653_MERGE_SHA,
    deployment_sha_public: null as string | null,
    cycle: (ss.current_cycle as string) ?? (vs.cycle as string) ?? null,
    latest_attested_seal: (vs.latest_seal_id as string) ?? null,
    attested_seal_index: (vs.seals_count as number) ?? null,
    projected_next_sequence: (rb.in_progress_block as number) ?? null,
    historical_collision_pairs: (rt.collision_pair_count as number) ?? null,
    contested_block_positions: liveContestedCount,
    affected_block_numbers: liveAffectedBlockNumbers,
    uncontested_positions: witness.clean_block_numbers.length,
    canonical_reserve_blocks: rt.canonical_reserve_blocks ?? null,
    integrity_gate_active: ig.active ?? null,
    reserve_block_lane: vs.reserve_block_lane ?? null,
    candidate_formation_blocked: acc.candidate_formation_blocked ?? null,
    candidate_in_flight: ((vs.candidate_attestation_state as Record<string, unknown>)?.in_flight ??
      false) as boolean,
    unsealed_accumulator_mic: (vs.in_progress_balance as number) ?? (ss.balance_readiness as Record<string, unknown>)?.in_progress_balance ?? null,
    integrity_gate_reasons: ig.reasons ?? [],
    seal_integrity_gate_source: ig.source ?? null,
    latest_sealed_at: vs.latest_sealed_at ?? null,
    gi_current: vs.gi_current ?? null,
    health_status: health.data?.status ?? null,
    kv_available: (health.data?.kv as Record<string, unknown>)?.available ?? null,
    collision_affected_blocks_source: collisionAffectedBlocks ? `${baseUrl}/api/vault/status` : null,
    fetch_failures: failures,
  };

  const witness_audit_hash = computeWitnessAuditHash(witness);
  const resolution_table_hash = computeResolutionTableHash(table);

  const drift = compareBaseline(observed as Record<string, unknown>, liveContestedCount);

  const dryRun = await executeBatchDryRun({
    witnessPath: WITNESS_PATH,
    resolutionTablePath: TABLE_PATH,
    created_at: receipt_created_at,
    previous_active_version: null,
    previous_latest_pointer: observed.latest_attested_seal as string | null,
  });

  let circular = { fails_without_batch: false, detail: 'not run' };
  if (dryRun.manifest) {
    const seals = buildFixtureSealsFromWitness(witness, table);
    circular = await demonstrateSingleReceiptCircularDependency({
      manifest: dryRun.manifest,
      seals,
    });

    const b41 = verifyBoundaryContinuity({
      seals,
      canonical_assignments: dryRun.manifest.canonical_assignments,
      clean_block_numbers: witness.clean_block_numbers,
      from_block: 41,
      to_block: 42,
    });
    const b131 = verifyBoundaryContinuity({
      seals,
      canonical_assignments: dryRun.manifest.canonical_assignments,
      clean_block_numbers: witness.clean_block_numbers,
      from_block: 131,
      to_block: 132,
    });

    if (b41 !== 'pass' && dryRun.report) {
      dryRun.errors.push(`live boundary 41->42 verification returned ${b41}`);
      dryRun.ok = false;
    }

    if (dryRun.report) {
      dryRun.report.metrics.boundary_131_132 = b131 === 'pass' ? 'pass' : 'pending_track_r_step_8';
    }
  }

  const manifest = dryRun.manifest;
  const report = dryRun.report;
  const rollback_hash = report ? hashObject(report.rollback_plan as unknown as Record<string, unknown>) : null;

  const evidence = await buildTrackREvidencePackage({
    capture_id,
    captured_at,
    environment_identifier: 'cursor-cloud-agent',
    observed: observed as Record<string, unknown>,
    drift,
    fetch_failures: failures,
    witness,
    resolution_table: table,
    witness_audit_hash,
    resolution_table_hash,
    dryRunOk: dryRun.ok,
    dryRunErrors: dryRun.errors,
    manifest,
    report,
    rollback_hash,
  });

  const status = evidence.executive_status;
  const process_exit_code = evidence.process_exit_code;
  const lineage_snapshot_hash = evidence.lineage_snapshot_hash;
  const telemetry_snapshot_hash = evidence.telemetry_snapshot_hash;
  const execution_witness_hash = evidence.execution_witness_hash;
  const affectedBlockComparison = evidence.affected_block_comparison;
  const affectedBlockEvidence = evidence.affected_block_evidence;
  const liveWitness = evidence.live_witness_attempt;
  const liveBoundary4142 = evidence.live_boundary_41_42;
  const witnessSealIdCount = collectTrackRWitnessSealIds(witness).length;

  const packageJson = {
    schema: OUT_SCHEMA,
    capture_id,
    captured_at,
    executive_status: status,
    process_exit_code,
    execution_authorized: false,
    production_mutation_performed: false,
    attestation_hashes: evidence.attestation_hashes,
    snapshot_identity: {
      lineage_snapshot_hash,
      telemetry_snapshot_hash,
      execution_witness_hash,
      note: 'Four-object ZEUS/EVE packet: semantic manifest, lineage snapshot, execution witness, rollback manifest.',
    },
    deployment_sha: {
      pr653_merge_sha: PR653_MERGE_SHA,
      pr654_merge_sha: '5dbaaa6f3d328e01f2b81105e683acee9269ec1d',
      production_head_sha: null,
      note: 'Public endpoints do not expose Vercel git SHA; verify via deployment dashboard before execution.',
    },
    observed_baseline: observed,
    handoff_baseline: HANDOFF_BASELINE,
    drift,
    affected_block_comparison: {
      set_match: affectedBlockComparison.set_match,
      missing_from_live: affectedBlockComparison.missing_from_live,
      unexpected_in_live: affectedBlockComparison.unexpected_in_live,
      duplicate_live_positions: affectedBlockComparison.duplicate_live_positions,
      pinned_contested_count: affectedBlockComparison.pinned_contested_count,
      live_contested_count: affectedBlockComparison.live_contested_count,
      collision_pair_count_live: affectedBlockComparison.collision_pair_count_live,
      live_source: affectedBlockComparison.live_source,
      live_artifact_fresh: affectedBlockComparison.live_artifact_fresh,
      live_artifact_stale: affectedBlockComparison.live_artifact_stale,
      audited_at: affectedBlockComparison.audited_at,
      errors: affectedBlockComparison.errors,
    },
    affected_block_evidence: {
      source: affectedBlockEvidence.source,
      derived_from_primary_kv: affectedBlockEvidence.derived_from_primary_kv,
      errors: affectedBlockEvidence.errors,
      status_api_collision_affected_blocks: collisionAffectedBlocks,
    },
    pinned_evidence: {
      witness_path: WITNESS_PATH,
      witness_audit_hash,
      resolution_table_path: TABLE_PATH,
      resolution_table_hash,
      witness_seal_id_count: witnessSealIdCount,
      collision_pair_count_pinned: TRACK_R_HISTORICAL_CONFLICT_PAIRS,
      contested_positions_pinned: witness.contested_block_numbers.length,
    },
    execution_witness: {
      requirement_doc: 'docs/epicon/cycles/C-403/TRACK_R_EXECUTION_WITNESS_REQUIREMENTS.md',
      authenticated_read: liveWitness.export?.authenticated_read ?? false,
      export_complete: liveWitness.export?.export_complete ?? false,
      export_source: liveWitness.export_source,
      expected_universe_count: liveWitness.expected_universe_count,
      summary: liveWitness.export?.summary ?? null,
      verification_errors: liveWitness.verification_errors,
      blocked_reason: liveWitness.blocked_reason,
      kv_identity_ok: liveWitness.kv_identity_ok,
      primary_read_count: liveWitness.primary_read_count,
      fallback_read_count: liveWitness.fallback_read_count,
      execution_witness_hash,
    },
    live_boundary_41_42: liveBoundary4142,
    governance_disposition: manifest?.governance_disposition ?? TRACK_R_GOVERNANCE_DISPOSITION,
    governance131_cutoff: evidence.governance131,
    repair_engine: {
      repair_id: TRACK_R_BATCH_REPAIR_ID,
      version: 'C-403 batch engine (PR #653)',
      dry_run_ok: dryRun.ok,
      dry_run_errors: dryRun.errors,
      circular_dependency: circular,
      manifest_hash: manifest?.manifest_hash ?? null,
      report_hash: report ? dryRunReportHash(report) : null,
      rollback_manifest_hash: rollback_hash,
      manifest_verified: manifest ? verifyManifestHash(manifest) : false,
      validation: manifest
        ? validateBatchManifest({ manifest, resolutionTable: table, mode: 'dry_run' })
        : null,
    },
    boundaries: {
      '41->42': report?.metrics.boundary_41_42 ?? null,
      '131->132': report?.metrics.boundary_131_132 ?? null,
      boundary_131_disposition: {
        status: 'verified_unattached_no_edge',
        promoted_through_position: 131,
        preserved_unattached_range: '132-194',
        proposed_latest_canonical_seal_id:
          manifest?.governance_disposition.proposed_latest_canonical_seal_id ??
          TRACK_R_GOVERNANCE_DISPOSITION.proposed_latest_canonical_seal_id,
        requires_post_repair_audit_before_attach: true,
      },
    },
    lineage_roots: {
      before_root: {
        latest_attested_seal_id: observed.latest_attested_seal,
        canonical_reserve_blocks: observed.canonical_reserve_blocks,
        active_lineage_version: null,
        integrity_gate_active: observed.integrity_gate_active,
      },
      proposed_after_root: {
        derived_latest_canonical_seal_id: report?.staged.derived_latest_canonical_seal_id ?? null,
        expected_active_version_key: LINEAGE_ACTIVE_VERSION_KEY,
        expected_version_prefix: `watchdog:lineage:version:${TRACK_R_BATCH_REPAIR_ID}:`,
      },
    },
    reproducibility: {
      command: 'pnpm track-r:live-dry-run-package',
      fixture_dry_run: 'pnpm watchdog:batch-collision-repair',
      contract_tests: 'pnpm exec tsx tests/contract/batchCollisionRepair.test.ts && pnpm exec tsx tests/contract/trackRFailClosed.test.ts',
      typecheck: 'pnpm exec tsc --noEmit',
      build: 'pnpm build',
    },
    attestation_placeholders: {
      zeus_verdict: 'pending',
      eve_verdict: 'pending',
      human_approval: 'pending',
      required_hashes: {
        capture_id,
        semantic_manifest_hash: manifest?.manifest_hash ?? null,
        lineage_snapshot_hash,
        execution_witness_hash,
        rollback_manifest_hash: rollback_hash,
        telemetry_snapshot_hash,
      },
    },
    explicit_no_production_change:
      'No Redis/KV mutation, canonical promotion, integrity-gate clearing, candidate formation, or sealing occurred.',
  };

  writeFileSync(join(OUT_DIR, 'TRACK_R_LIVE_SNAPSHOT.json'), `${JSON.stringify(observed, null, 2)}\n`);
  writeFileSync(join(OUT_DIR, 'TRACK_R_LIVE_DRY_RUN_PACKAGE.json'), `${JSON.stringify(packageJson, null, 2)}\n`);
  writeFileSync(
    join(OUT_DIR, 'TRACK_R_AFFECTED_BLOCK_COMPARISON.json'),
    `${JSON.stringify(packageJson.affected_block_comparison, null, 2)}\n`,
  );
  writeFileSync(
    join(OUT_DIR, 'TRACK_R_LIVE_WITNESS_COMPARISON_REDACTED.json'),
    `${JSON.stringify(
      {
        capture_id,
        executive_status: status,
        authenticated_read: liveWitness.export?.authenticated_read ?? false,
        export_complete: liveWitness.export?.export_complete ?? false,
        expected_universe_count: liveWitness.expected_universe_count,
        summary: liveWitness.export?.summary ?? null,
        verification_errors: liveWitness.verification_errors,
        blocked_reason: liveWitness.blocked_reason,
        execution_witness_hash,
        per_record_status_counts: evidence.redacted_witness_comparison.reduce(
          (acc, record) => {
            acc[record.status] = (acc[record.status] ?? 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        ),
        records: evidence.redacted_witness_comparison,
      },
      null,
      2,
    )}\n`,
  );

  if (report) {
    writeFileSync(join(OUT_DIR, 'TRACK_R_LIVE_DRY_RUN_REPORT.json'), `${JSON.stringify(report, null, 2)}\n`);
  }
  if (manifest) {
    writeFileSync(
      join(OUT_DIR, 'TRACK_R_MANIFEST_REDACTED.json'),
      `${JSON.stringify(redactManifestForReview(manifest), null, 2)}\n`,
    );
    writeFileSync(
      join(OUT_DIR, 'TRACK_R_ROLLBACK_MANIFEST.json'),
      `${JSON.stringify(report?.rollback_plan ?? {}, null, 2)}\n`,
    );
  }

  const md = buildHumanReport({
    packageJson,
    capture_id,
    status,
    drift,
    dryRun,
    manifest,
    report,
    lineage_snapshot_hash,
    telemetry_snapshot_hash,
    execution_witness_hash,
    rollback_hash,
    circular,
    witness_audit_hash,
    resolution_table_hash,
    affectedBlockComparison,
    liveWitness,
  });
  writeFileSync('docs/epicon/cycles/C-403/TRACK_R_LIVE_DRY_RUN_REPORT.md', md);

  writeFileSync(
    join(OUT_DIR, 'ZEUS_ATTESTATION_TEMPLATE.md'),
    buildZeusTemplate(packageJson, manifest, report),
  );
  writeFileSync(
    join(OUT_DIR, 'EVE_ATTESTATION_TEMPLATE.md'),
    buildEveTemplate(packageJson, manifest, report),
  );
  writeFileSync(
    join(OUT_DIR, 'HUMAN_EXECUTION_CHECKLIST.md'),
    buildHumanChecklist(packageJson, manifest, report),
  );

  console.log(`Executive status: ${status}`);
  console.log(`Process exit code: ${process_exit_code}`);
  console.log(`Capture ID: ${capture_id}`);
  console.log(`Lineage snapshot hash: ${lineage_snapshot_hash}`);
  console.log(`Telemetry snapshot hash: ${telemetry_snapshot_hash}`);
  if (manifest) console.log(`Semantic manifest hash: ${manifest.manifest_hash}`);
  if (execution_witness_hash) console.log(`Execution witness hash: ${execution_witness_hash}`);
  if (rollback_hash) console.log(`Rollback manifest hash: ${rollback_hash}`);
  console.log(`Execution authorized: false`);
  console.log(`Affected block set match: ${affectedBlockComparison.set_match}`);
  console.log(`Live witness ok: ${liveWitness.ok}`);
  console.log(`Wrote package to ${OUT_DIR}/`);
  console.log(`Wrote ${'docs/epicon/cycles/C-403/TRACK_R_LIVE_DRY_RUN_REPORT.md'}`);

  if (process_exit_code !== 0) {
    console.error('\nPackage generated with fail-closed status — review before attestation.');
    process.exit(process_exit_code);
  }
}

function buildHumanReport(args: {
  packageJson: Record<string, unknown>;
  capture_id: string;
  status: string;
  drift: DriftItem[];
  dryRun: Awaited<ReturnType<typeof executeBatchDryRun>>;
  manifest?: CollisionRepairBatchManifest;
  report?: BatchDryRunReport;
  lineage_snapshot_hash: string;
  telemetry_snapshot_hash: string;
  execution_witness_hash: string | null;
  rollback_hash: string | null;
  circular: { fails_without_batch: boolean; detail: string };
  witness_audit_hash: string;
  resolution_table_hash: string;
  affectedBlockComparison: ReturnType<typeof compareAffectedBlockSets>;
  liveWitness: Awaited<ReturnType<typeof buildTrackREvidencePackage>>['live_witness_attempt'];
}): string {
  const m = args.manifest;
  const observed = args.packageJson.observed_baseline as Record<string, unknown>;
  const affected = args.affectedBlockComparison;
  return `# Track R Live Dry-Run Report (C-403)

**Capture ID:** \`${args.capture_id}\`  
**Captured:** ${observed.captured_at as string}  
**Executive status:** **${args.status}**  
**Execution authorized:** **NOT AUTHORIZED**  
**Production mutation:** **NONE**

---

## 1. Summary

Single capture (\`${args.capture_id}\`). Dry-run only. **Semantic manifest hash** excludes volatile telemetry. Snapshot split: **lineage** (CAS gate) vs **telemetry** (informational). Positions 132–194 are **verified_unattached** — no fabricated 131→132 edge.

Fail-closed corrections (post PR #654): process exit code matches executive status; affected-block set compared exactly (not collision count alone); authenticated live witness export attempted when credentials available.

---

## 2. Production snapshot

| Field | Observed |
|---|---|
| Capture ID | \`${args.capture_id}\` |
| Lineage snapshot hash | \`${args.lineage_snapshot_hash}\` |
| Telemetry snapshot hash | \`${args.telemetry_snapshot_hash}\` |
| Execution witness hash | \`${args.execution_witness_hash ?? 'n/a'}\` |
| Unsealed accumulator | ~${observed.unsealed_accumulator_mic} MIC |
| Collision pairs | ${observed.historical_collision_pairs ?? 'n/a'} |
| Affected block set match | ${affected.set_match} |
| Integrity gate | ${observed.integrity_gate_active ? 'active' : 'inactive'} |

### Drift vs handoff

${args.drift.length === 0 ? '_No drift._' : args.drift.map((d) => `- **${d.field}**: ${d.severity}`).join('\n')}

Accumulator drift is **telemetry only** — must not block lineage CAS.

### Affected-block set comparison

\`\`\`json
${JSON.stringify(
  {
    set_match: affected.set_match,
    missing_from_live: affected.missing_from_live,
    unexpected_in_live: affected.unexpected_in_live,
    duplicate_live_positions: affected.duplicate_live_positions,
  },
  null,
  2,
)}
\`\`\`

---

## 3. Dry-run

| Field | Value |
|---|---|
| Semantic manifest hash | \`${m?.manifest_hash ?? 'n/a'}\` |
| Rollback manifest hash | \`${args.rollback_hash ?? 'n/a'}\` |
| Promoted through | position 131 (\`${m?.governance_disposition.proposed_latest_canonical_seal_id ?? 'seal-C-358-131'}\`) |
| 132–194 | verified_unattached |
| 131→132 edge | not_fabricated |

---

## 4. Execution witness

| Field | Value |
|---|---|
| Authenticated read | ${args.liveWitness.export?.authenticated_read ?? false} |
| Export complete | ${args.liveWitness.export?.export_complete ?? false} |
| Expected universe | ${args.liveWitness.expected_universe_count} |
| Blocked reason | ${args.liveWitness.blocked_reason ?? 'none'} |
| Summary | ${args.liveWitness.export ? JSON.stringify(args.liveWitness.export.summary) : 'n/a'} |

See \`artifacts/C-403/track-r-live-dry-run/TRACK_R_LIVE_WITNESS_COMPARISON_REDACTED.json\`.

---

## 5. Execution authorization

**Track R execution status: NOT AUTHORIZED.**
`;
}

function buildZeusTemplate(
  pkg: Record<string, unknown>,
  manifest?: CollisionRepairBatchManifest,
  report?: BatchDryRunReport,
): string {
  const hashes = (pkg.attestation_placeholders as Record<string, unknown>).required_hashes as Record<
    string,
    string | null
  >;
  return `# ZEUS Attestation Template — Track R Batch (UNSIGNED)

**Capture ID:** \`${hashes.capture_id}\`  
**Semantic manifest hash:** \`${manifest?.manifest_hash ?? 'TBD'}\`  
**Lineage snapshot hash (CAS gate):** \`${hashes.lineage_snapshot_hash}\`  
**Execution witness hash:** \`${hashes.execution_witness_hash ?? 'TBD'}\`  
**Rollback manifest hash:** \`${hashes.rollback_manifest_hash}\`  
**Telemetry snapshot hash (informational):** \`${hashes.telemetry_snapshot_hash}\`

## Verification checklist

- [ ] Semantic manifest hash recomputes identically (excludes created_at, verdicts, telemetry)
- [ ] Exact live affected-block set matches pinned contested universe (not collision count alone)
- [ ] Every collision represented (125 pairs; 123 contested positions)
- [ ] 125 losing candidates quarantined, not erased
- [ ] No fabricated 131→132 edge; 132–194 verified_unattached
- [ ] Boundary 41→42 passes on seal evidence
- [ ] Lineage snapshot hash matches attestation (not full telemetry snapshot)
- [ ] Execution witness hash recomputes from per-record live KV comparison
- [ ] Live seal witness: matched = expected universe, mismatched = 0, missing = 0, unexpected = 0
- [ ] Rollback restores precise pre-execution state

## Verdict (do not pre-fill)

- [ ] ADOPT
- [ ] CLARIFY
- [ ] QUARANTINE
- [ ] REJECT

**ZEUS signature / timestamp:** _pending_

**Notes:** Dry-run writes: ${report?.writes_performed ?? 0}; execution NOT AUTHORIZED
`;
}

function buildEveTemplate(
  pkg: Record<string, unknown>,
  manifest?: CollisionRepairBatchManifest,
  report?: BatchDryRunReport,
): string {
  const hashes = (pkg.attestation_placeholders as Record<string, unknown>).required_hashes as Record<
    string,
    string | null
  >;
  return `# EVE Attestation Template — Track R Batch (UNSIGNED)

**Capture ID:** \`${hashes.capture_id}\`  
**Semantic manifest hash:** \`${manifest?.manifest_hash ?? 'TBD'}\`  
**Lineage snapshot hash:** \`${hashes.lineage_snapshot_hash}\`  
**Execution witness hash:** \`${hashes.execution_witness_hash ?? 'TBD'}\`  
**Rollback manifest hash:** \`${hashes.rollback_manifest_hash}\`

## Constitutional scope checklist

- [ ] Selection policy matches Track R canon (\`component_coherent_hybrid\`)
- [ ] Promotion stops at position 131; 132–194 preserved unattached
- [ ] No fabricated continuity at 131→132 boundary
- [ ] Historical evidence not erased (125 pairs auditable)
- [ ] Manifest semantic hash stable across capture timestamps
- [ ] Same four-hash packet as ZEUS attestation
- [ ] Authenticated live witness binds repair to production KV (zero mismatch/missing)

## Verdict (do not pre-fill)

- [ ] ADOPT
- [ ] CLARIFY
- [ ] QUARANTINE
- [ ] REJECT

**EVE signature / timestamp:** _pending_

**Governance disposition:** promote through 131 only; 132–194 require post-repair audit before attach
`;
}

function buildHumanChecklist(
  pkg: Record<string, unknown>,
  manifest?: CollisionRepairBatchManifest,
  _report?: BatchDryRunReport,
): string {
  const hashes = (pkg.attestation_placeholders as Record<string, unknown>).required_hashes as Record<
    string,
    string | null
  >;
  return `# Human Execution Checklist — Track R (pre-mutation)

Do **not** authorize production mutation until all items are checked.

## Required named approvals

- [ ] Capture ID: \`${hashes.capture_id}\`
- [ ] Lineage snapshot hash (CAS): \`${hashes.lineage_snapshot_hash}\`
- [ ] Semantic manifest hash: \`${manifest?.manifest_hash ?? 'TBD'}\`
- [ ] Execution witness hash: \`${hashes.execution_witness_hash ?? 'TBD'}\`
- [ ] Rollback manifest hash: \`${hashes.rollback_manifest_hash}\`
- [ ] Promoted through position 131 only; 132–194 verified_unattached
- [ ] Exact live affected-block set matches pinned universe
- [ ] Authenticated live seal witness export (per-record equality, not count alone)

## Governance gates

- [ ] ZEUS ADOPT for exact four-hash packet
- [ ] EVE ADOPT for exact four-hash packet
- [ ] Fresh lineage snapshot hash matches (telemetry drift allowed)
- [ ] Live seal witness export verified (zero mismatch/missing/unexpected)
- [ ] Contract tests + typecheck + build pass
- [ ] Human custodian review recorded

## Explicit prohibitions (this PR)

- [ ] No production KV mutation
- [ ] No integrity gate clearing
- [ ] No seal candidate formation

**Human consent signature / date:** _pending_
`;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
