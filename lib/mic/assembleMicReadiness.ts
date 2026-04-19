import { resolveGiForTerminal } from '@/lib/integrity/resolveGi';
import { resolveOperatorCycleId } from '@/lib/eve/resolve-operator-cycle';
import { buildMicReadinessV1, type VaultStatusJson } from '@/lib/mic/runtime-readiness';
import { mergeMicReadinessFromUpstream } from '@/lib/mic/readinessMerge';
import type { MicReadinessResponse } from '@/lib/mic/types';
import { withHash } from '@/lib/mic/hash';
import { kvGet, KV_KEYS } from '@/lib/kv/store';
import { computeVaultSealLaneSemantics } from '@/lib/vault/lane-status';
import { getVaultStatusPayload, listVaultDeposits } from '@/lib/vault/vault';
import { countSeals, getCandidate, getInProgressBalance, getLatestSeal } from '@/lib/vault-v2/store';
import { SENTINEL_ATTESTATION_COUNT } from '@/lib/vault-v2/constants';

type UpstreamSnapshot = {
  snapshot?: Partial<MicReadinessResponse> & Record<string, unknown>;
  received_at?: string;
  source?: string;
};

async function getVaultStatusShape(giOverride: number | null): Promise<VaultStatusJson> {
  const gi =
    typeof giOverride === 'number' && Number.isFinite(giOverride) ? Math.max(0, Math.min(1, giOverride)) : null;

  const v1 = await getVaultStatusPayload(gi);
  const [inProgressBalance, sealsCount, latestSeal, candidate] = await Promise.all([
    getInProgressBalance(),
    countSeals(),
    getLatestSeal(),
    getCandidate(),
  ]);

  const seal_lane = computeVaultSealLaneSemantics({
    inProgressBalance,
    sealsCountAttested: sealsCount,
    giCurrent: gi,
    giThreshold: v1.gi_threshold,
    sustainCyclesRequired: v1.sustain_cycles_required,
    v1Status: v1.status,
    candidateInFlight: Boolean(candidate),
  });

  const candidate_attestation_state = candidate
    ? {
        in_flight: true,
        seal_id: candidate.seal_id,
        sequence: candidate.sequence,
        requested_at: candidate.requested_at,
        timeout_at: candidate.timeout_at,
        attestations_received: Object.keys(candidate.attestations).length,
        attestations_needed: SENTINEL_ATTESTATION_COUNT - Object.keys(candidate.attestations).length,
      }
    : {
        in_flight: false,
        seal_id: null,
        attestations_received: 0,
        timeout_at: null,
      };

  return {
    ...v1,
    gi_current: gi,
    in_progress_balance: inProgressBalance,
    sealed_reserve_total: seal_lane.sealed_reserve_total,
    current_tranche_balance: seal_lane.current_tranche_balance,
    carry_forward_in_tranche: seal_lane.carry_forward_in_tranche,
    reserve_threshold_met: seal_lane.reserve_threshold_met,
    gi_threshold_met: seal_lane.gi_threshold_met,
    sustain_cycles_met: seal_lane.sustain_met,
    fountain_status: seal_lane.fountain_lane,
    reserve_lane: seal_lane.reserve_lane,
    seals_count: sealsCount,
    latest_seal_id: latestSeal?.seal_id ?? null,
    latest_seal_at: latestSeal?.sealed_at ?? null,
    latest_seal_hash: latestSeal?.seal_hash ?? null,
    candidate_attestation_state,
  };
}

export async function resolveReadinessCycle(cycleParam?: string | null): Promise<string> {
  let cycle = cycleParam?.trim() ?? '';
  if (!cycle) {
    try {
      cycle = (await resolveOperatorCycleId()) ?? '';
    } catch {
      cycle = '';
    }
  }
  return cycle;
}

/** Local MIC_READINESS_V1 from Vault + deposits (no upstream merge). */
export async function assembleLocalMicReadiness(cycleParam?: string | null): Promise<MicReadinessResponse> {
  const cycle = await resolveReadinessCycle(cycleParam);
  const micSnapRaw = await kvGet<string>(KV_KEYS.MIC_READINESS_SNAPSHOT);
  const resolvedGi = await resolveGiForTerminal({ micReadinessSnapshotRaw: micSnapRaw });
  const vaultStatus = await getVaultStatusShape(resolvedGi.gi);
  const deposits = await listVaultDeposits(120);
  const base = buildMicReadinessV1({
    vaultStatus,
    depositsSample: deposits,
    cycle: cycle || undefined,
  });
  return {
    ...base,
    gi: resolvedGi.gi,
  };
}

async function loadUpstreamReadiness(): Promise<Partial<MicReadinessResponse> | null> {
  const raw = await kvGet<string | UpstreamSnapshot | MicReadinessResponse>(KV_KEYS.MIC_READINESS_SNAPSHOT);
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'string') {
    try {
      const o = JSON.parse(raw) as UpstreamSnapshot & MicReadinessResponse;
      if (o && typeof o === 'object' && 'snapshot' in o && o.snapshot) {
        return o.snapshot as Partial<MicReadinessResponse>;
      }
      if (o && typeof o === 'object' && (o as MicReadinessResponse).schema === 'MIC_READINESS_V1') {
        return o as Partial<MicReadinessResponse>;
      }
      return o as Partial<MicReadinessResponse>;
    } catch {
      return null;
    }
  }
  if (typeof raw === 'object' && raw !== null && 'snapshot' in raw) {
    return (raw as UpstreamSnapshot).snapshot ?? null;
  }
  return raw as Partial<MicReadinessResponse>;
}

/** Merge Substrate KV snapshot over local when present; re-hash merged body. */
export async function getMergedMicReadiness(cycleParam?: string | null): Promise<MicReadinessResponse> {
  const local = await assembleLocalMicReadiness(cycleParam);
  const upstream = await loadUpstreamReadiness();
  const mergedBase = mergeMicReadinessFromUpstream(local, upstream);
  const micSnapRaw = await kvGet<string>(KV_KEYS.MIC_READINESS_SNAPSHOT);
  const giResolved = await resolveGiForTerminal({ micReadinessSnapshotRaw: micSnapRaw });
  const merged: MicReadinessResponse = {
    ...mergedBase,
    gi: giResolved.gi ?? mergedBase.gi,
  };
  const proof = withHash(merged);
  return {
    ...merged,
    readiness_proof: {
      hash: proof.hash,
      hash_algorithm: 'sha256',
    },
  };
}
