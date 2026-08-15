import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  compareAffectedBlockSets,
  computeLineageSnapshotHash,
  computeResolutionTableHash,
  computeWitnessAuditHash,
  hashAffectedBlockNumbers,
  loadAuthoritativeLiveAffectedBlockEvidence,
  loadResolutionTableFromFile,
  loadWitnessFromFile,
} from '@/lib/watchdog/batchRepair';
import { hasUpstashKvCredentials } from '@/lib/kv/upstashEnv';
import type { CollisionAffectedBlockSnapshot } from '@/lib/vault/collision-affected-blocks';
import {
  CAPTURE_0123Z_EXPECTED_HASHES,
  CAPTURE_0123Z_ID,
  verifyTrackRCaptureAttestation,
  type TrackRCaptureAttestationCheck,
} from '@/lib/watchdog/batchRepair/verifyTrackRCaptureAttestation';

export const TRACK_R_GOVERNANCE_ATTESTATION_PATH =
  'docs/epicon/cycles/C-403/TRACK_R_GOVERNANCE_ATTESTATION_capture-0123Z.json';

export const TRACK_R_IMMUTABLE_ARCHIVE =
  'artifacts/C-403/track-r-live-dry-run/history/capture-0123Z';

export type TrackRExecutionReadinessStatus =
  | 'awaiting_human_consent'
  | 'cas_drift'
  | 'blocked';

export type TrackRExecutionReadiness = {
  capture_id: string;
  verified_at: string;
  readiness_status: TrackRExecutionReadinessStatus;
  execution_authorized: false;
  governance_attestation_path: string;
  attested_lineage_snapshot_hash: string;
  fresh_lineage_snapshot_hash: string | null;
  fresh_cas_match: boolean | null;
  checks: TrackRCaptureAttestationCheck[];
};

function readJsonIfExists<T = Record<string, unknown>>(path: string): T | null {
  if (!existsSync(path)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return null;
  }
}

function addCheck(
  checks: TrackRCaptureAttestationCheck[],
  check: string,
  result: TrackRCaptureAttestationCheck['result'],
  detail: string,
): void {
  checks.push({ check, result, detail });
}

async function fetchJson<T>(url: string): Promise<{ ok: boolean; status: number; data: T | null }> {
  try {
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(30_000) });
    const data = (await res.json()) as T;
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

function parseObservedBaseline(args: {
  vaultStatus: Record<string, unknown>;
  sealStatus: Record<string, unknown>;
  healthStatus: Record<string, unknown> | null;
  cleanBlockCount: number;
}): Record<string, unknown> {
  const rt = (args.vaultStatus.reserve_block_truth ?? {}) as Record<string, unknown>;
  const ig = (rt.integrity_gate ?? {}) as Record<string, unknown>;
  const acc = (rt.accumulator ?? {}) as Record<string, unknown>;
  const rb = (args.vaultStatus.reserve_block ?? {}) as Record<string, unknown>;
  const collisionAffectedBlocks = (rt.collision_affected_blocks ??
    null) as CollisionAffectedBlockSnapshot | null;
  const liveAffectedBlockNumbers = collisionAffectedBlocks?.affected_block_numbers ?? null;

  return {
    cycle: (args.sealStatus.current_cycle as string) ?? (args.vaultStatus.cycle as string) ?? null,
    latest_attested_seal: (args.vaultStatus.latest_seal_id as string) ?? null,
    attested_seal_index: (args.vaultStatus.seals_count as number) ?? null,
    projected_next_sequence: (rb.in_progress_block as number) ?? null,
    historical_collision_pairs: (rt.collision_pair_count as number) ?? null,
    contested_block_positions: liveAffectedBlockNumbers?.length ?? null,
    affected_block_numbers: liveAffectedBlockNumbers,
    uncontested_positions: args.cleanBlockCount,
    canonical_reserve_blocks: rt.canonical_reserve_blocks ?? null,
    integrity_gate_active: ig.active ?? null,
    reserve_block_lane: args.vaultStatus.reserve_block_lane ?? null,
    candidate_formation_blocked: acc.candidate_formation_blocked ?? null,
    unsealed_accumulator_mic:
      (args.vaultStatus.in_progress_balance as number) ??
      (args.sealStatus.balance_readiness as Record<string, unknown>)?.in_progress_balance ??
      null,
    gi_current: args.vaultStatus.gi_current ?? null,
    health_status: args.healthStatus?.status ?? null,
    kv_available: (args.healthStatus?.kv as Record<string, unknown>)?.available ?? null,
    latest_sealed_at: args.vaultStatus.latest_sealed_at ?? null,
    environment: 'production-execution-readiness-probe',
  };
}

export async function verifyTrackRExecutionReadiness(args?: {
  archivePath?: string;
  governancePath?: string;
  verifiedAt?: string;
  baseUrl?: string;
  probeFreshCas?: boolean;
}): Promise<TrackRExecutionReadiness> {
  const archivePath = args?.archivePath ?? join(process.cwd(), TRACK_R_IMMUTABLE_ARCHIVE);
  const governancePath = args?.governancePath ?? join(process.cwd(), TRACK_R_GOVERNANCE_ATTESTATION_PATH);
  const verifiedAt = args?.verifiedAt ?? new Date().toISOString();
  const baseUrl = (args?.baseUrl ?? 'https://mobius-civic-ai-terminal.vercel.app').replace(/\/$/, '');
  const probeFreshCas = args?.probeFreshCas ?? true;
  const checks: TrackRCaptureAttestationCheck[] = [];

  const governance = readJsonIfExists<Record<string, unknown>>(governancePath);
  if (!governance) {
    addCheck(checks, 'governance_attestation', 'fail', `missing or unreadable ${governancePath}`);
    return {
      capture_id: CAPTURE_0123Z_ID,
      verified_at: verifiedAt,
      readiness_status: 'blocked',
      execution_authorized: false,
      governance_attestation_path: governancePath,
      attested_lineage_snapshot_hash: CAPTURE_0123Z_EXPECTED_HASHES.lineage_snapshot_hash,
      fresh_lineage_snapshot_hash: null,
      fresh_cas_match: null,
      checks,
    };
  }

  addCheck(
    checks,
    'governance_capture_id',
    governance.capture_id === CAPTURE_0123Z_ID ? 'pass' : 'fail',
    String(governance.capture_id ?? 'missing'),
  );

  const verdicts = (governance.governance_verdicts ?? {}) as Record<
    string,
    { verdict?: string; manifest_field?: string }
  >;
  addCheck(
    checks,
    'governance_zeus_adopt',
    verdicts.zeus?.verdict === 'ADOPT' && verdicts.zeus?.manifest_field === 'approved'
      ? 'pass'
      : 'fail',
    JSON.stringify(verdicts.zeus ?? {}),
  );
  addCheck(
    checks,
    'governance_eve_adopt',
    verdicts.eve?.verdict === 'ADOPT' && verdicts.eve?.manifest_field === 'approved'
      ? 'pass'
      : 'fail',
    JSON.stringify(verdicts.eve ?? {}),
  );
  addCheck(
    checks,
    'governance_human_pending',
    verdicts.human_approval?.verdict === 'pending' &&
      verdicts.human_approval?.manifest_field === 'pending'
      ? 'pass'
      : 'fail',
    JSON.stringify(verdicts.human_approval ?? {}),
  );
  addCheck(
    checks,
    'governance_execution_authorized',
    governance.execution_authorized === false ? 'pass' : 'fail',
    String(governance.execution_authorized ?? 'missing'),
  );

  const attestation = verifyTrackRCaptureAttestation({ archivePath, verifiedAt });
  for (const row of attestation.checks) {
    checks.push({
      check: `attestation:${row.check}`,
      result: row.result,
      detail: row.detail,
    });
  }
  addCheck(
    checks,
    'attestation_summary',
    attestation.verification_status === 'adopt_ready' ? 'pass' : 'fail',
    attestation.verification_status,
  );

  let fresh_lineage_snapshot_hash: string | null = null;
  let fresh_cas_match: boolean | null = null;

  if (!probeFreshCas) {
    addCheck(checks, 'fresh_cas_probe', 'warn', 'skipped by caller');
  } else if (!hasUpstashKvCredentials()) {
    addCheck(
      checks,
      'fresh_cas_probe',
      'fail',
      'production KV credentials required for pre-mutation CAS probe',
    );
  } else {
    const witness = loadWitnessFromFile(
      join(process.cwd(), 'docs/epicon/cycles/C-403/fixtures/C403_RESERVE_BLOCK_COLLISION_WITNESS.pin.json'),
    );
    const table = loadResolutionTableFromFile(
      join(process.cwd(), 'docs/epicon/cycles/C-403/fixtures/C403_COLLISION_RESOLUTION_TABLE.pin.json'),
    );
    const witnessAuditHash = computeWitnessAuditHash(witness);
    const resolutionTableHash = computeResolutionTableHash(table);

    const [vaultStatus, sealStatus, health] = await Promise.all([
      fetchJson<Record<string, unknown>>(`${baseUrl}/api/vault/status`),
      fetchJson<Record<string, unknown>>(`${baseUrl}/api/vault/seal-status`),
      fetchJson<Record<string, unknown>>(`${baseUrl}/api/health`),
    ]);

    if (!vaultStatus.ok || !vaultStatus.data || !sealStatus.ok || !sealStatus.data) {
      addCheck(
        checks,
        'fresh_cas_public_api',
        'fail',
        `vault/status=${vaultStatus.status} seal-status=${sealStatus.status}`,
      );
    } else {
      addCheck(checks, 'fresh_cas_public_api', 'pass', baseUrl);
      const observedBaseline = parseObservedBaseline({
        vaultStatus: vaultStatus.data,
        sealStatus: sealStatus.data,
        healthStatus: health.data,
        cleanBlockCount: witness.clean_block_numbers.length,
      });

      const affectedBlockEvidence = await loadAuthoritativeLiveAffectedBlockEvidence({
        capture_observed_at: verifiedAt,
        operator_cycle: (observedBaseline.cycle as string | null) ?? null,
        collision_pair_count_live: (observedBaseline.historical_collision_pairs as number | null) ?? null,
      });

      const affectedBlockComparison = compareAffectedBlockSets({
        pinned_block_numbers: witness.contested_block_numbers,
        live_snapshot: affectedBlockEvidence.snapshot,
        live_source: affectedBlockEvidence.source,
        capture_observed_at: verifiedAt,
        collision_pair_count_live: (observedBaseline.historical_collision_pairs as number | null) ?? null,
        operator_cycle: (observedBaseline.cycle as string | null) ?? null,
      });

      addCheck(
        checks,
        'fresh_affected_block_set_match',
        affectedBlockComparison.set_match ? 'pass' : 'fail',
        JSON.stringify({
          set_match: affectedBlockComparison.set_match,
          pinned: affectedBlockComparison.pinned_contested_count,
          live: affectedBlockComparison.live_contested_count,
          errors: affectedBlockComparison.errors,
        }),
      );

      const liveBlocks =
        (observedBaseline.affected_block_numbers as number[] | undefined) ??
        affectedBlockComparison.live_block_numbers ??
        [];

      fresh_lineage_snapshot_hash = computeLineageSnapshotHash({
        capture_id: CAPTURE_0123Z_ID,
        cycle: (observedBaseline.cycle as string | null) ?? null,
        latest_attested_seal: (observedBaseline.latest_attested_seal as string | null) ?? null,
        attested_seal_index: (observedBaseline.attested_seal_index as number | null) ?? null,
        projected_next_sequence: (observedBaseline.projected_next_sequence as number | null) ?? null,
        historical_collision_pairs: (observedBaseline.historical_collision_pairs as number | null) ?? null,
        contested_block_positions:
          affectedBlockComparison.live_contested_count ??
          (observedBaseline.contested_block_positions as number | null) ??
          0,
        uncontested_positions: (observedBaseline.uncontested_positions as number | null) ?? 0,
        canonical_reserve_blocks: observedBaseline.canonical_reserve_blocks ?? null,
        integrity_gate_active: observedBaseline.integrity_gate_active as boolean | null,
        reserve_block_lane: (observedBaseline.reserve_block_lane as string | null) ?? null,
        candidate_formation_blocked: observedBaseline.candidate_formation_blocked as boolean | null,
        witness_audit_hash: witnessAuditHash,
        resolution_table_hash: resolutionTableHash,
        active_lineage_version: null,
        live_canonical_pointer: null,
        pinned_affected_block_numbers_hash: hashAffectedBlockNumbers(witness.contested_block_numbers),
        live_affected_block_numbers_hash:
          liveBlocks.length > 0 ? hashAffectedBlockNumbers(liveBlocks) : null,
        affected_block_set_match: affectedBlockComparison.set_match,
      });

      fresh_cas_match =
        fresh_lineage_snapshot_hash === CAPTURE_0123Z_EXPECTED_HASHES.lineage_snapshot_hash;
      addCheck(
        checks,
        'fresh_lineage_snapshot_cas',
        fresh_cas_match ? 'pass' : 'fail',
        `attested=${CAPTURE_0123Z_EXPECTED_HASHES.lineage_snapshot_hash} fresh=${fresh_lineage_snapshot_hash}`,
      );
    }
  }

  const hasFail = checks.some((row) => row.result === 'fail');
  const casDrift =
    fresh_cas_match === false ||
    checks.some((row) => row.check === 'fresh_lineage_snapshot_cas' && row.result === 'fail');

  let readiness_status: TrackRExecutionReadinessStatus = 'awaiting_human_consent';
  if (hasFail) {
    readiness_status = casDrift ? 'cas_drift' : 'blocked';
  } else if (casDrift) {
    readiness_status = 'cas_drift';
  }

  return {
    capture_id: CAPTURE_0123Z_ID,
    verified_at: verifiedAt,
    readiness_status,
    execution_authorized: false,
    governance_attestation_path: governancePath,
    attested_lineage_snapshot_hash: CAPTURE_0123Z_EXPECTED_HASHES.lineage_snapshot_hash,
    fresh_lineage_snapshot_hash,
    fresh_cas_match,
    checks,
  };
}
