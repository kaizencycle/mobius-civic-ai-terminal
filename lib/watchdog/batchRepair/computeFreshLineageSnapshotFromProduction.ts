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
import { verifyProductionKvEnvironmentIdentity } from '@/lib/watchdog/batchRepair/kvEnvironmentIdentity';
import { loadLiveLineagePointerObservationsPrimaryOnly } from '@/lib/watchdog/batchRepair/liveLineagePointerObservations';
import type { CollisionAffectedBlockSnapshot } from '@/lib/vault/collision-affected-blocks';
import {
  CAPTURE_0123Z_EXPECTED_HASHES,
  CAPTURE_0123Z_ID,
  type TrackRCaptureAttestationCheck,
} from '@/lib/watchdog/batchRepair/verifyTrackRCaptureAttestation';

export const TRACK_R_WITNESS_FIXTURE_PATH =
  'docs/epicon/cycles/C-403/fixtures/C403_RESERVE_BLOCK_COLLISION_WITNESS.pin.json';
export const TRACK_R_RESOLUTION_TABLE_FIXTURE_PATH =
  'docs/epicon/cycles/C-403/fixtures/C403_COLLISION_RESOLUTION_TABLE.pin.json';

/** Prefer authoritative KV comparison set over public vault/status surface for CAS binding. */
export function resolveLiveAffectedBlockNumbersForCas(args: {
  authoritativeLiveBlockNumbers: number[] | null;
  publicSurfaceBlockNumbers: number[] | undefined;
}): number[] | null {
  return args.authoritativeLiveBlockNumbers;
}

export type FreshLineageSnapshotFromProduction = {
  capture_id: string;
  verified_at: string;
  attested_lineage_snapshot_hash: string;
  fresh_lineage_snapshot_hash: string | null;
  fresh_cas_match: boolean | null;
  fresh_lineage_snapshot_hash_matches: boolean;
  observed_integrity_gate_active: boolean | null;
  checks: TrackRCaptureAttestationCheck[];
};

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
  environment: string;
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
    environment: args.environment,
  };
}

/** Authenticated production re-read + lineage CAS recompute (shared by readiness probe and apply preflight). */
export async function computeFreshLineageSnapshotFromProduction(args?: {
  attestedLineageSnapshotHash?: string;
  captureId?: string;
  verifiedAt?: string;
  baseUrl?: string;
  repoRoot?: string;
  environment?: string;
  checkPrefix?: string;
}): Promise<FreshLineageSnapshotFromProduction> {
  const verifiedAt = args?.verifiedAt ?? new Date().toISOString();
  const baseUrl = (args?.baseUrl ?? 'https://mobius-civic-ai-terminal.vercel.app').replace(/\/$/, '');
  const repoRoot = args?.repoRoot ?? process.cwd();
  const captureId = args?.captureId ?? CAPTURE_0123Z_ID;
  const attestedLineageSnapshotHash =
    args?.attestedLineageSnapshotHash ?? CAPTURE_0123Z_EXPECTED_HASHES.lineage_snapshot_hash;
  const environment = args?.environment ?? 'production-lineage-cas-probe';
  const prefix = args?.checkPrefix ?? 'fresh';
  const checks: TrackRCaptureAttestationCheck[] = [];

  let fresh_lineage_snapshot_hash: string | null = null;
  let fresh_cas_match: boolean | null = null;
  let observed_integrity_gate_active: boolean | null = null;

  if (!hasUpstashKvCredentials()) {
    addCheck(
      checks,
      `${prefix}_cas_probe`,
      'fail',
      'production KV credentials required for lineage CAS probe',
    );
  } else {
    const kvIdentity = await verifyProductionKvEnvironmentIdentity();
    addCheck(
      checks,
      `${prefix}_production_kv_identity`,
      kvIdentity.ok ? 'pass' : 'fail',
      kvIdentity.ok
        ? JSON.stringify({
            latest_seal_id: kvIdentity.observed.latest_seal_id,
            attested_index_count: kvIdentity.observed.attested_index_count,
          })
        : kvIdentity.errors.join('; '),
    );

    if (!kvIdentity.ok) {
      addCheck(
        checks,
        `${prefix}_cas_probe`,
        'fail',
        'production KV identity anchor verification failed before CAS probe',
      );
    } else {
      const lineagePointers = await loadLiveLineagePointerObservationsPrimaryOnly();
      addCheck(
        checks,
        `${prefix}_lineage_pointer_observation`,
        lineagePointers.ok ? 'pass' : 'fail',
        lineagePointers.ok
          ? JSON.stringify({
              active_lineage_version: lineagePointers.active_lineage_version,
              live_canonical_pointer: lineagePointers.live_canonical_pointer,
            })
          : lineagePointers.errors.join('; '),
      );

      if (!lineagePointers.ok) {
        addCheck(
          checks,
          `${prefix}_cas_probe`,
          'fail',
          'live lineage pointer observation unavailable in primary KV',
        );
      } else {
        const witness = loadWitnessFromFile(join(repoRoot, TRACK_R_WITNESS_FIXTURE_PATH));
        const table = loadResolutionTableFromFile(join(repoRoot, TRACK_R_RESOLUTION_TABLE_FIXTURE_PATH));
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
            `${prefix}_cas_public_api`,
            'fail',
            `vault/status=${vaultStatus.status} seal-status=${sealStatus.status}`,
          );
        } else {
          addCheck(checks, `${prefix}_cas_public_api`, 'pass', baseUrl);
          const observedBaseline = parseObservedBaseline({
            vaultStatus: vaultStatus.data,
            sealStatus: sealStatus.data,
            healthStatus: health.data,
            cleanBlockCount: witness.clean_block_numbers.length,
            environment,
          });
          observed_integrity_gate_active =
            typeof observedBaseline.integrity_gate_active === 'boolean'
              ? observedBaseline.integrity_gate_active
              : null;

          const publicLatestSeal = (observedBaseline.latest_attested_seal as string | null) ?? null;
          addCheck(
            checks,
            `${prefix}_kv_identity_public_latest_seal`,
            publicLatestSeal && kvIdentity.observed.latest_seal_id === publicLatestSeal
              ? 'pass'
              : 'fail',
            `kv=${kvIdentity.observed.latest_seal_id ?? 'null'} public=${publicLatestSeal ?? 'null'}`,
          );

          const affectedBlockEvidence = await loadAuthoritativeLiveAffectedBlockEvidence({
            capture_observed_at: verifiedAt,
            operator_cycle: (observedBaseline.cycle as string | null) ?? null,
            collision_pair_count_live:
              (observedBaseline.historical_collision_pairs as number | null) ?? null,
          });

          const affectedBlockComparison = compareAffectedBlockSets({
            pinned_block_numbers: witness.contested_block_numbers,
            live_snapshot: affectedBlockEvidence.snapshot,
            live_source: affectedBlockEvidence.source,
            capture_observed_at: verifiedAt,
            collision_pair_count_live:
              (observedBaseline.historical_collision_pairs as number | null) ?? null,
            operator_cycle: (observedBaseline.cycle as string | null) ?? null,
          });

          addCheck(
            checks,
            `${prefix}_affected_block_set_match`,
            affectedBlockComparison.set_match ? 'pass' : 'fail',
            JSON.stringify({
              set_match: affectedBlockComparison.set_match,
              pinned: affectedBlockComparison.pinned_contested_count,
              live: affectedBlockComparison.live_contested_count,
              errors: affectedBlockComparison.errors,
            }),
          );

          const publicSurfaceBlocks = observedBaseline.affected_block_numbers as number[] | undefined;
          const authoritativeLiveBlocks = resolveLiveAffectedBlockNumbersForCas({
            authoritativeLiveBlockNumbers: affectedBlockComparison.live_block_numbers,
            publicSurfaceBlockNumbers: publicSurfaceBlocks,
          });

          if (
            publicSurfaceBlocks &&
            publicSurfaceBlocks.length > 0 &&
            authoritativeLiveBlocks &&
            authoritativeLiveBlocks.length > 0 &&
            hashAffectedBlockNumbers(publicSurfaceBlocks) !== hashAffectedBlockNumbers(authoritativeLiveBlocks)
          ) {
            addCheck(
              checks,
              `${prefix}_public_surface_vs_authoritative`,
              'warn',
              'public vault/status affected_block_numbers diverges from authoritative KV comparison set; CAS uses authoritative set only',
            );
          }

          fresh_lineage_snapshot_hash = computeLineageSnapshotHash({
            capture_id: captureId,
            cycle: (observedBaseline.cycle as string | null) ?? null,
            latest_attested_seal: publicLatestSeal,
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
            active_lineage_version: lineagePointers.active_lineage_version,
            live_canonical_pointer: lineagePointers.live_canonical_pointer,
            pinned_affected_block_numbers_hash: hashAffectedBlockNumbers(witness.contested_block_numbers),
            live_affected_block_numbers_hash: authoritativeLiveBlocks
              ? hashAffectedBlockNumbers(authoritativeLiveBlocks)
              : null,
            affected_block_set_match: affectedBlockComparison.set_match,
          });

          fresh_cas_match = fresh_lineage_snapshot_hash === attestedLineageSnapshotHash;
          addCheck(
            checks,
            `${prefix}_lineage_snapshot_cas`,
            fresh_cas_match ? 'pass' : 'fail',
            `attested=${attestedLineageSnapshotHash} fresh=${fresh_lineage_snapshot_hash}`,
          );
        }
      }
    }
  }

  return {
    capture_id: captureId,
    verified_at: verifiedAt,
    attested_lineage_snapshot_hash: attestedLineageSnapshotHash,
    fresh_lineage_snapshot_hash,
    fresh_cas_match,
    fresh_lineage_snapshot_hash_matches: fresh_cas_match === true,
    observed_integrity_gate_active,
    checks,
  };
}
