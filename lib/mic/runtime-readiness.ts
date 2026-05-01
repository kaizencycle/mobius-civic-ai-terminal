/**
 * Assembles MIC_READINESS_V1 from existing Vault + GI payloads (server-side only).
 */

import { currentCycleId } from '@/lib/eve/cycle-engine';
import { VAULT_RESERVE_PARCEL_UNITS } from '@/lib/vault-v2/constants';
import { SENTINEL_AGENTS } from '@/lib/vault-v2/types';
import type {
  MicReadinessResponse,
  MicMintReadiness,
  MicNoveltyStatus,
  MicQuorumStatus,
  MicReplayStatus,
  MicSustainStatus,
} from '@/lib/mic/types';
import type { MicSustainStateV1 } from '@/lib/mic/sustainTracker';
import { SUSTAIN_GI_THRESHOLD } from '@/lib/mic/sustainTracker';

export type VaultStatusJson = {
  balance_reserve?: number;
  in_progress_balance?: number;
  sealed_reserve_total?: number;
  current_tranche_balance?: number;
  carry_forward_in_tranche?: number;
  activation_threshold?: number;
  gi_threshold?: number;
  gi_current?: number | null;
  sustain_cycles_required?: number;
  sustain_cycles_met?: boolean;
  gi_threshold_met?: boolean;
  reserve_threshold_met?: boolean;
  fountain_status?: string;
  reserve_lane?: string;
  seals_count?: number;
  latest_seal_id?: string | null;
  latest_seal_at?: string | null;
  latest_seal_hash?: string | null;
  candidate_attestation_state?: {
    in_flight?: boolean;
    attestations_received?: number;
    attestations_needed?: number;
    seal_id?: string | null;
    sequence?: number;
    requested_at?: string;
    timeout_at?: string | null;
  };
};

function fountainTriplet(lane: string | undefined): { locked: boolean; eligible: boolean; unlocked: boolean } {
  const s = (lane ?? 'locked').toLowerCase();
  if (s === 'active' || s === 'unsealed') {
    return { locked: false, eligible: true, unlocked: true };
  }
  if (s === 'tracking' || s === 'preview') {
    return { locked: true, eligible: true, unlocked: false };
  }
  return { locked: true, eligible: false, unlocked: false };
}

function trancheStatus(v: VaultStatusJson): MicReadinessResponse['reserve']['trancheStatus'] {
  const inP = v.in_progress_balance ?? 0;
  const cap = v.activation_threshold ?? VAULT_RESERVE_PARCEL_UNITS;
  const lane = v.reserve_lane;
  const eligible =
    Boolean(v.reserve_threshold_met) || inP >= cap || lane === 'tranche_ready' || lane === 'sealing';
  if (eligible) return 'eligible_for_seal';
  const sealed = v.sealed_reserve_total ?? 0;
  const cand = Boolean(v.candidate_attestation_state?.in_flight);
  if (sealed > 0 && inP < 1e-6 && !cand) return 'sealed';
  return 'in_progress';
}

/** Deposits are newest-first (Redis LPUSH); repeats = rows whose signature already appeared earlier in the list. */
function replayFromDeposits(deposits: { content_signature: string }[]): { pressure: number; status: MicReplayStatus } {
  if (deposits.length === 0) return { pressure: 0, status: 'clear' };
  const seen = new Set<string>();
  let repeats = 0;
  for (const d of deposits) {
    if (seen.has(d.content_signature)) repeats += 1;
    seen.add(d.content_signature);
  }
  const pressure = Number((repeats / deposits.length).toFixed(4));
  if (pressure >= 0.35) return { pressure, status: 'blocked' };
  if (pressure >= 0.15) return { pressure, status: 'elevated' };
  return { pressure, status: 'clear' };
}

function noveltyFromDeposits(deposits: { journal_score?: number }[]): { score: number; status: MicNoveltyStatus } {
  const scores = deposits.map((d) => d.journal_score).filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
  if (scores.length === 0) return { score: 0, status: 'acceptable' };
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const score = Number(avg.toFixed(4));
  if (avg >= 0.72) return { score, status: 'strong' };
  if (avg >= 0.45) return { score, status: 'acceptable' };
  return { score, status: 'weak' };
}

function quorumFromVault(v: VaultStatusJson): MicReadinessResponse['quorum'] {
  const required = [...SENTINEL_AGENTS];
  const cand = v.candidate_attestation_state;
  const inFlight = Boolean(cand?.in_flight);
  const received = typeof cand?.attestations_received === 'number' ? cand.attestations_received : 0;
  const needed = typeof cand?.attestations_needed === 'number' ? cand.attestations_needed : required.length;

  let status: MicQuorumStatus = 'pending';
  if (inFlight) {
    if (received >= required.length) status = 'satisfied';
    else if (received > 0) status = 'partial';
    else status = 'pending';
  } else {
    status = 'pending';
  }

  const attested: string[] = [];
  // We only have counts from status payload, not per-agent list, until seal detail is wired.
  return {
    required,
    attested,
    status,
    attestations_received: received,
    attestations_needed: Math.max(0, needed),
    seal_candidate_in_flight: inFlight,
  };
}

function deriveMintReadiness(v: VaultStatusJson, fountain: MicReadinessResponse['fountain'], quorum: MicReadinessResponse['quorum']): MicMintReadiness {
  if (fountain.unlocked) return 'fountain_ready';
  if (quorum.seal_candidate_in_flight && quorum.status !== 'satisfied') return 'quorum_pending';
  const tr = trancheStatus(v);
  if (tr === 'eligible_for_seal' && !quorum.seal_candidate_in_flight) return 'seal_ready';
  const hasReserve =
    (v.balance_reserve ?? 0) > 0 || (v.in_progress_balance ?? 0) > 0 || (v.sealed_reserve_total ?? 0) > 0;
  if (hasReserve) return 'reserve_only';
  return 'not_eligible';
}

export function buildMicReadinessV1(args: {
  vaultStatus: VaultStatusJson;
  depositsSample: { content_signature: string; journal_score?: number }[];
  cycle?: string;
  sustainState?: MicSustainStateV1 | null;
  replayPressure?: number;
  replayStatus?: MicReplayStatus;
  replay_decay_half_life_hours?: number;
}): MicReadinessResponse {
  const v = args.vaultStatus;
  const cycle = args.cycle?.trim() || currentCycleId();
  const gi = typeof v.gi_current === 'number' && Number.isFinite(v.gi_current) ? v.gi_current : null;
  const mintThresholdGi = v.gi_threshold ?? 0.95;
  const trancheTarget = v.activation_threshold ?? VAULT_RESERVE_PARCEL_UNITS;
  const inProgress = v.in_progress_balance ?? 0;
  const sealed = v.sealed_reserve_total ?? 0;
  const sustainMet = Boolean(v.sustain_cycles_met);
  const requiredSustain = v.sustain_cycles_required ?? 5;
  const st = args.sustainState;
  const consecutiveFromKv =
    st && typeof st.consecutiveEligibleCycles === 'number' && Number.isFinite(st.consecutiveEligibleCycles)
      ? Math.max(0, Math.floor(st.consecutiveEligibleCycles))
      : 0;
  const sustainPlaceholder = !st;
  let sustainStatus: MicSustainStatus = 'not_started';
  if (sustainMet) sustainStatus = 'satisfied';
  else if (consecutiveFromKv >= requiredSustain) sustainStatus = 'satisfied';
  else if (consecutiveFromKv > 0) sustainStatus = 'in_progress';

  const displayConsecutive = sustainMet
    ? requiredSustain
    : sustainPlaceholder
      ? 0
      : Math.min(consecutiveFromKv, requiredSustain);

  const sustain: MicReadinessResponse['sustain'] = {
    consecutiveEligibleCycles: displayConsecutive,
    requiredCycles: requiredSustain,
    status: sustainPlaceholder ? 'not_started' : sustainStatus,
    sustain_tracking_placeholder: sustainPlaceholder,
    lastEligibleCycle: st?.lastEligibleCycle ?? null,
    lastCheckedCycle: st?.lastCheckedCycle ?? null,
    gi_threshold: SUSTAIN_GI_THRESHOLD,
    last_cycle_eligible: gi !== null ? gi >= SUSTAIN_GI_THRESHOLD : null,
  };

  const depositReplay = replayFromDeposits(args.depositsSample);
  const pressure =
    typeof args.replayPressure === 'number' && Number.isFinite(args.replayPressure)
      ? args.replayPressure
      : depositReplay.pressure;
  const replayStatus =
    args.replayStatus ??
    (typeof args.replayPressure === 'number' && Number.isFinite(args.replayPressure)
      ? (pressure >= 0.35 ? 'blocked' : pressure >= 0.15 ? 'elevated' : 'clear')
      : depositReplay.status);
  const { score: noveltyScore, status: noveltyStatus } = noveltyFromDeposits(args.depositsSample);
  const fountainLane = v.fountain_status ?? 'locked';
  const fountain = { ...fountainTriplet(fountainLane), lane: fountainLane };
  const quorum = quorumFromVault(v);
  const mintReadiness = deriveMintReadiness(v, fountain, quorum);

  return {
    schema: 'MIC_READINESS_V1',
    cycle,
    gi,
    mintThresholdGi,
    reserve: {
      inProgressBalance: inProgress,
      trancheTarget,
      sealedReserveTotal: sealed,
      trancheStatus: trancheStatus(v),
      balanceReserveV1: v.balance_reserve ?? 0,
    },
    sustain,
    replay: {
      replayPressure: pressure,
      status: replayStatus,
      ...(typeof args.replay_decay_half_life_hours === 'number'
        ? { replay_decay_half_life_hours: args.replay_decay_half_life_hours }
        : {}),
    },
    novelty: { noveltyScore, status: noveltyStatus },
    quorum,
    fountain,
    mintReadiness,
    vault: {
      reserve_lane: v.reserve_lane ?? null,
      fountain_status: v.fountain_status ?? null,
      gi_threshold_met: v.gi_threshold_met ?? null,
      sustain_cycles_met: v.sustain_cycles_met ?? null,
      reserve_threshold_met: v.reserve_threshold_met ?? null,
      candidate_attestation_state: v.candidate_attestation_state ?? null,
    },
    updatedAt: new Date().toISOString(),
  };
}
