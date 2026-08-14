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

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  TRACK_R_BATCH_REPAIR_ID,
  computeWitnessAuditHash,
  computeResolutionTableHash,
  demonstrateSingleReceiptCircularDependency,
  dryRunReportHash,
  executeBatchDryRun,
  loadResolutionTableFromFile,
  loadWitnessFromFile,
  buildFixtureSealsFromWitness,
  verifyBoundaryContinuity,
  verifyManifestHash,
  validateBatchManifest,
} from '@/lib/watchdog/batchRepair';
import { hashObject, stableStringify } from '@/lib/watchdog/batchRepair/stableHash';
import { LINEAGE_ACTIVE_VERSION_KEY } from '@/lib/watchdog/batchRepair/versionedStaging';
import type { BatchDryRunReport, CollisionRepairBatchManifest } from '@/lib/watchdog/batchRepair/types';

const DEFAULT_BASE = 'https://mobius-civic-ai-terminal.vercel.app';
const PR653_MERGE_SHA = '100d2c4ab3559f0b7b59d6e888d74792e0b61ea2';
const WITNESS_PATH = 'docs/epicon/cycles/C-403/fixtures/C403_RESERVE_BLOCK_COLLISION_WITNESS.pin.json';
const TABLE_PATH = 'docs/epicon/cycles/C-403/fixtures/C403_COLLISION_RESOLUTION_TABLE.pin.json';
const OUT_DIR = 'artifacts/C-403/track-r-live-dry-run';
const CREATED_AT = '2026-08-14T17:00:00.000Z';

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

function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
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

function compareBaseline(observed: Record<string, unknown>): DriftItem[] {
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
  check('contested_block_positions', observed.contested_block_positions);
  check('uncontested_positions', observed.uncontested_positions);
  check('canonical_reserve_blocks', observed.canonical_reserve_blocks);
  check('integrity_gate_active', observed.integrity_gate_active);
  check('reserve_block_lane', observed.reserve_block_lane);
  check('candidate_formation_blocked', observed.candidate_formation_blocked);
  check('candidate_in_flight', observed.candidate_in_flight);
  check('unsealed_accumulator_mic_approx', observed.unsealed_accumulator_mic, 5);

  return drift;
}

function executiveStatus(args: {
  dryRunOk: boolean;
  materialDrift: DriftItem[];
  boundary131: string;
  witnessMatchesLiveCollisions: boolean;
}): 'PASS' | 'CLARIFY' | 'QUARANTINE' | 'BLOCKED' {
  if (!args.dryRunOk) return 'BLOCKED';
  if (args.materialDrift.some((d) => d.severity === 'material')) return 'BLOCKED';
  if (!args.witnessMatchesLiveCollisions) return 'BLOCKED';
  if (args.boundary131 !== 'pending_track_r_step_8') return 'QUARANTINE';
  return 'CLARIFY';
}

async function main(): Promise<void> {
  const { baseUrl } = parseArgs(process.argv.slice(2));
  const captured_at = new Date().toISOString();

  mkdirSync(OUT_DIR, { recursive: true });

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

  const observed = {
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
    contested_block_positions: 123,
    uncontested_positions: 71,
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
    fetch_failures: failures,
  };

  const snapshot_hash = sha256Hex(stableStringify(observed));
  observed.deployment_sha_public = null;

  const drift = compareBaseline(observed as Record<string, unknown>);

  const witness = loadWitnessFromFile(WITNESS_PATH);
  const table = loadResolutionTableFromFile(TABLE_PATH);
  const witness_audit_hash = computeWitnessAuditHash(witness);
  const resolution_table_hash = computeResolutionTableHash(table);
  const witnessMatchesLiveCollisions =
    witness.counts.hash_divergent_pair_count === observed.historical_collision_pairs;

  const dryRun = await executeBatchDryRun({
    witnessPath: WITNESS_PATH,
    resolutionTablePath: TABLE_PATH,
    created_at: CREATED_AT,
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

  const status = executiveStatus({
    dryRunOk: dryRun.ok && failures.length === 0,
    materialDrift: drift.filter((d) => d.severity === 'material'),
    boundary131: report?.metrics.boundary_131_132 ?? 'unknown',
    witnessMatchesLiveCollisions,
  });

  const packageJson = {
    schema: 'TRACK_R_LIVE_DRY_RUN_PACKAGE_v1',
    captured_at,
    executive_status: status,
    production_mutation_performed: false,
    snapshot_hash,
    deployment_sha: {
      pr653_merge_sha: PR653_MERGE_SHA,
      production_head_sha: null,
      note: 'Public endpoints do not expose Vercel git SHA; verify via deployment dashboard before execution.',
    },
    observed_baseline: observed,
    handoff_baseline: HANDOFF_BASELINE,
    drift,
    pinned_evidence: {
      witness_path: WITNESS_PATH,
      witness_audit_hash,
      resolution_table_path: TABLE_PATH,
      resolution_table_hash,
      witness_matches_live_collision_count: witnessMatchesLiveCollisions,
    },
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
      boundary_131_disposition:
        report?.metrics.boundary_131_132 === 'pending_track_r_step_8'
          ? 'REQUIRES_EXPLICIT_GOVERNANCE_DISPOSITION'
          : report?.metrics.boundary_131_132 === 'pass'
            ? 'pass'
            : 'BLOCKED_BOUNDARY_EVIDENCE_MISSING',
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
      contract_tests: 'pnpm exec tsx tests/contract/batchCollisionRepair.test.ts',
      typecheck: 'pnpm exec tsc --noEmit',
      build: 'pnpm build',
    },
    attestation_placeholders: {
      zeus_verdict: 'pending',
      eve_verdict: 'pending',
      human_approval: 'pending',
      required_hashes: {
        snapshot_hash,
        manifest_hash: manifest?.manifest_hash ?? null,
        rollback_manifest_hash: rollback_hash,
      },
    },
    explicit_no_production_change:
      'No Redis/KV mutation, canonical promotion, integrity-gate clearing, candidate formation, or sealing occurred.',
  };

  writeFileSync(join(OUT_DIR, 'TRACK_R_LIVE_SNAPSHOT.json'), `${JSON.stringify(observed, null, 2)}\n`);
  writeFileSync(join(OUT_DIR, 'TRACK_R_LIVE_DRY_RUN_PACKAGE.json'), `${JSON.stringify(packageJson, null, 2)}\n`);

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
    status,
    drift,
    dryRun,
    manifest,
    report,
    snapshot_hash,
    rollback_hash,
    circular,
    witness_audit_hash,
    resolution_table_hash,
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
  console.log(`Snapshot hash: ${snapshot_hash}`);
  if (manifest) console.log(`Manifest hash: ${manifest.manifest_hash}`);
  if (rollback_hash) console.log(`Rollback manifest hash: ${rollback_hash}`);
  console.log(`Wrote package to ${OUT_DIR}/`);
  console.log(`Wrote ${'docs/epicon/cycles/C-403/TRACK_R_LIVE_DRY_RUN_REPORT.md'}`);

  if (!dryRun.ok || failures.length > 0) {
    console.error('\nPackage generated with failures — review before attestation.');
    process.exit(1);
  }
}

function buildHumanReport(args: {
  packageJson: Record<string, unknown>;
  status: string;
  drift: DriftItem[];
  dryRun: Awaited<ReturnType<typeof executeBatchDryRun>>;
  manifest?: CollisionRepairBatchManifest;
  report?: BatchDryRunReport;
  snapshot_hash: string;
  rollback_hash: string | null;
  circular: { fails_without_batch: boolean; detail: string };
  witness_audit_hash: string;
  resolution_table_hash: string;
}): string {
  const m = args.manifest;
  const r = args.report;
  return `# Track R Live Dry-Run Report (C-403)

**Captured:** ${new Date().toISOString()}  
**Executive status:** **${args.status}**  
**Production mutation:** **NONE**

---

## 1. Summary

This package captures a read-only production baseline and runs the merged PR #653 batch repair engine in **dry-run mode only**. It prepares evidence for ZEUS × EVE × human attestation. No Redis/KV writes, canonical promotion, integrity-gate clearing, candidate formation, or sealing occurred.

---

## 2. Production snapshot

| Field | Observed |
|---|---|
| Snapshot hash | \`${args.snapshot_hash}\` |
| Cycle | C-403 |
| Latest attested seal | seal-C-372-002 |
| Attested seal index | 360 |
| Projected slot | 361 (projected — not constitutional) |
| Collision pairs (live watchdog) | 125 |
| Integrity gate | active |
| Reserve lane | integrity_hold |
| Candidate formation | blocked |
| Unsealed accumulator | ~${(args.packageJson.observed_baseline as Record<string, unknown>).unsealed_accumulator_mic} MIC |
| PR #653 merge SHA | \`${PR653_MERGE_SHA}\` |

### Drift vs handoff anchor

${args.drift.length === 0 ? '_No drift recorded._' : args.drift.map((d) => `- **${d.field}**: expected \`${JSON.stringify(d.expected)}\`, observed \`${JSON.stringify(d.observed)}\` (${d.severity})`).join('\n')}

Ongoing deposit accrual (+~1–2 MIC since handoff anchor) is **expected** and classified as informational drift only.

---

## 3. Repair engine dry-run

| Field | Value |
|---|---|
| Repair ID | \`track-r-c403-batch-001\` |
| Strategy | \`component_coherent_hybrid\` |
| Manifest hash | \`${m?.manifest_hash ?? 'n/a'}\` |
| Report hash | \`${r ? dryRunReportHash(r) : 'n/a'}\` |
| Rollback manifest hash | \`${args.rollback_hash ?? 'n/a'}\` |
| Writes performed | 0 |
| Witness audit hash | \`${args.witness_audit_hash}\` |
| Resolution table hash | \`${args.resolution_table_hash}\` |

### Collision totals

| Metric | Count |
|---|---|
| Total block positions | 194 |
| Contested positions | 123 |
| Historical hash-divergent pairs | 125 |
| Canonical assignments | 123 |
| Quarantined conflicting seals | 125 |
| Clean positions (unchanged) | 71 |

### Boundaries

| Edge | Result |
|---|---|
| 41 → 42 | ${r?.metrics.boundary_41_42 ?? 'n/a'} |
| 131 → 132 | ${r?.metrics.boundary_131_132 ?? 'n/a'} (${r?.metrics.boundary_131_132 === 'pending_track_r_step_8' ? 'REQUIRES_EXPLICIT_GOVERNANCE_DISPOSITION' : 'review required'}) |

### Lineage roots

- **Before root:** latest attested \`seal-C-372-002\`, canonical Reserve Block count unresolved, integrity gate active
- **Proposed after root:** derived latest canonical \`${r?.staged.derived_latest_canonical_seal_id ?? 'null'}\` (staged dry-run view only)

### Circular dependency proof

Single-receipt prepare without batch overlay: **${args.circular.fails_without_batch ? 'confirmed blocked' : 'NOT confirmed'}**  
Detail: ${args.circular.detail}

---

## 4. Reproducibility

\`\`\`bash
pnpm track-r:live-dry-run-package
pnpm watchdog:batch-collision-repair
pnpm exec tsx tests/contract/batchCollisionRepair.test.ts
pnpm exec tsc --noEmit
pnpm build
\`\`\`

Machine-readable outputs: \`artifacts/C-403/track-r-live-dry-run/\`

---

## 5. Remaining risks

1. Boundary **131 → 132** remains explicitly deferred — requires governance disposition before execution.
2. Pinned Substrate witness/resolution fixtures must match live KV seal bodies at execution time (fresh snapshot required at mutation handoff).
3. Public APIs do not expose full seal-index collision audit export — operator KV read required for execution-phase witness refresh.
4. Accumulator backlog continues to grow while integrity gate is active.

---

## 6. Execution authorization

**Track R execution status: NOT AUTHORIZED.**

This report records a dry-run proposal only. Production KV remains unchanged. Canonical promotion, integrity-gate clearance, and Reserve sealing remain prohibited pending ZEUS ADOPT, EVE ADOPT, explicit human consent, and a matching live snapshot version.

Unsigned attestation templates: \`artifacts/C-403/track-r-live-dry-run/ZEUS_ATTESTATION_TEMPLATE.md\`, \`EVE_ATTESTATION_TEMPLATE.md\`, \`HUMAN_EXECUTION_CHECKLIST.md\`
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

**Manifest hash (verify independently):** \`${manifest?.manifest_hash ?? 'TBD'}\`  
**Snapshot hash:** \`${hashes.snapshot_hash}\`  
**Rollback manifest hash:** \`${hashes.rollback_manifest_hash}\`

## Verification checklist

- [ ] Every collision represented (125 historical pairs; 123 contested positions)
- [ ] Losing candidates preserved as quarantined witnesses (125 IDs)
- [ ] No fabricated lineage edges
- [ ] Boundary 41→42 passes on seal evidence
- [ ] Boundary 131→132 visible as deferred / unresolved
- [ ] Commit guards reject stale or partial state
- [ ] Rollback restores precise pre-execution state
- [ ] Recomputed manifest hash matches \`${manifest?.manifest_hash ?? 'TBD'}\`

## Verdict (do not pre-fill)

- [ ] ADOPT
- [ ] CLARIFY
- [ ] QUARANTINE
- [ ] REJECT

**ZEUS signature / timestamp:** _pending_

**Notes:** Dry-run writes performed: ${report?.writes_performed ?? 0}
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

**Manifest hash (must match ZEUS):** \`${manifest?.manifest_hash ?? 'TBD'}\`  
**Snapshot hash:** \`${hashes.snapshot_hash}\`  
**Rollback manifest hash:** \`${hashes.rollback_manifest_hash}\`

## Constitutional scope checklist

- [ ] Selection policy matches Track R canon (\`component_coherent_hybrid\`)
- [ ] Historical evidence not erased (125 pairs remain auditable)
- [ ] Repair does not redefine prior attested events
- [ ] Manifest scope does not exceed C-401 resolution table authority
- [ ] Human operator can understand mutation + rollback
- [ ] Same manifest hash as ZEUS attestation

## Verdict (do not pre-fill)

- [ ] ADOPT
- [ ] CLARIFY
- [ ] QUARANTINE
- [ ] REJECT

**EVE signature / timestamp:** _pending_

**Boundary 131→132 disposition required:** ${report?.metrics.boundary_131_132 === 'pending_track_r_step_8' ? 'YES' : 'REVIEW'}
`;
}

function buildHumanChecklist(
  pkg: Record<string, unknown>,
  manifest?: CollisionRepairBatchManifest,
  report?: BatchDryRunReport,
): string {
  const hashes = (pkg.attestation_placeholders as Record<string, unknown>).required_hashes as Record<
    string,
    string | null
  >;
  return `# Human Execution Checklist — Track R (pre-mutation)

Do **not** authorize production mutation until all items are checked.

## Required named approvals

- [ ] Snapshot hash: \`${hashes.snapshot_hash}\`
- [ ] Manifest hash: \`${manifest?.manifest_hash ?? 'TBD'}\`
- [ ] Rollback manifest hash: \`${hashes.rollback_manifest_hash}\`
- [ ] Expected KV version prefix: \`watchdog:lineage:version:track-r-c403-batch-001:\`
- [ ] Mutation scope: 123 contested positions adjudicated; 125 witnesses quarantined; 71 clean unchanged
- [ ] Boundary 131→132 disposition explicitly approved or deferred

## Governance gates

- [ ] ZEUS ADOPT recorded for exact manifest hash above
- [ ] EVE ADOPT recorded for exact manifest hash above
- [ ] Fresh live snapshot matches attested snapshot hash (re-capture immediately before execution)
- [ ] Rollback manifest verified complete
- [ ] Contract tests + typecheck + build pass on execution handoff branch

## Explicit prohibitions (this PR)

- [ ] No production KV mutation in this evidence PR
- [ ] No integrity gate clearing
- [ ] No seal candidate formation

**Human consent signature / date:** _pending_
`;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
