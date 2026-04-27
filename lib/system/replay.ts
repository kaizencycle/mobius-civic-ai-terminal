import { currentCycleId } from '@/lib/eve/cycle-engine';
import {
  kvHealth,
  kvInspectSamples,
  loadEchoState,
  loadGIState,
  loadGIStateCarry,
  loadSignalSnapshot,
  loadTripwireState,
} from '@/lib/kv/store';
import {
  countAllSeals,
  countSeals,
  getCandidate,
  getInProgressBalance,
  getLatestSeal,
  listAllSeals,
  readInProgressHashes,
} from '@/lib/vault-v2/store';

export const REPLAY_SYSTEM_VERSION = 'C-293.phase5.v1' as const;

type ReplaySourceStatus = 'available' | 'partial' | 'missing' | 'unsafe';

type ReplaySource = {
  id: string;
  layer: number;
  label: string;
  status: ReplaySourceStatus;
  count?: number;
  detail: string;
};

export type ReplayPlan = {
  ok: boolean;
  version: typeof REPLAY_SYSTEM_VERSION;
  timestamp: string;
  cycle: string;
  mode: 'plan' | 'dry_run';
  destructive: false;
  sources: ReplaySource[];
  rebuild: {
    possible: boolean;
    confidence: number;
    can_restore_hot_state: boolean;
    can_restore_vault_state: boolean;
    can_restore_chamber_savepoints: boolean;
    unsafe_to_restore: string[];
    would_restore: string[];
  };
  vault: {
    in_progress_balance: number;
    in_progress_hash_count: number;
    attested_seals: number;
    quarantined_seals: number;
    finalized_seals: number;
    latest_seal_id: string | null;
    latest_seal_hash: string | null;
    candidate_seal_id: string | null;
    recent_seals: Array<{
      seal_id: string;
      sequence: number;
      status: string;
      seal_hash: string;
      prev_seal_hash: string | null;
      substrate_attestation_id?: string | null;
      substrate_event_hash?: string | null;
    }>;
    quarantined_seal_ids: string[];
  };
  hot_state: {
    gi_available: boolean;
    gi_carry_available: boolean;
    signal_available: boolean;
    echo_available: boolean;
    tripwire_available: boolean;
  };
  savepoints: {
    total_matched: number;
    sampled: number;
  };
  canon: string;
};

function source(args: ReplaySource): ReplaySource {
  return args;
}

function confidenceFromSources(sources: ReplaySource[]): number {
  if (sources.length === 0) return 0;
  const weights: Record<ReplaySourceStatus, number> = {
    available: 1,
    partial: 0.55,
    missing: 0,
    unsafe: 0,
  };
  const score = sources.reduce((sum, row) => sum + weights[row.status], 0) / sources.length;
  return Number(score.toFixed(3));
}

export async function buildReplayPlan(mode: 'plan' | 'dry_run' = 'plan'): Promise<ReplayPlan> {
  const [
    health,
    gi,
    giCarry,
    signal,
    echo,
    tripwire,
    inProgressBalance,
    inProgressHashes,
    attestedSeals,
    finalizedSeals,
    latestSeal,
    candidate,
    recentSeals,
    savepointScan,
  ] = await Promise.all([
    kvHealth(),
    loadGIState(),
    loadGIStateCarry(),
    loadSignalSnapshot(),
    loadEchoState(),
    loadTripwireState(),
    getInProgressBalance(),
    readInProgressHashes(),
    countSeals(),
    countAllSeals(),
    getLatestSeal(),
    getCandidate(),
    listAllSeals(10),
    kvInspectSamples('mobius:chamber:savepoint:*', 10),
  ]);

  const sources: ReplaySource[] = [
    source({
      id: 'substrate_civic_ledger',
      layer: 1,
      label: 'Substrate / Civic Ledger records',
      status: latestSeal?.substrate_attestation_id || latestSeal?.substrate_event_hash ? 'available' : 'partial',
      count: latestSeal?.substrate_attestation_id || latestSeal?.substrate_event_hash ? 1 : 0,
      detail: latestSeal?.substrate_attestation_id || latestSeal?.substrate_event_hash
        ? 'Latest Reserve Block has a Substrate pointer.'
        : 'No latest Substrate pointer observed; replay can still inspect local seal chain but cannot prove full immortality from this layer.',
    }),
    source({
      id: 'vault_seals',
      layer: 2,
      label: 'Reserve Block seal chain',
      status: finalizedSeals > 0 ? 'available' : inProgressBalance > 0 || inProgressHashes.length > 0 ? 'partial' : 'missing',
      count: finalizedSeals,
      detail: finalizedSeals > 0
        ? `${finalizedSeals} finalized seal(s), ${attestedSeals} attested.`
        : 'No finalized seals found; only in-progress Vault state may be recoverable.',
    }),
    source({
      id: 'candidate_state',
      layer: 3,
      label: 'In-flight quorum candidate',
      status: candidate ? 'available' : 'missing',
      count: candidate ? 1 : 0,
      detail: candidate ? `Candidate ${candidate.seal_id} is in flight.` : 'No in-flight quorum candidate.',
    }),
    source({
      id: 'chamber_savepoints',
      layer: 4,
      label: 'Chamber savepoint cache',
      status: savepointScan.ok && savepointScan.totalMatched > 0 ? 'available' : savepointScan.ok ? 'missing' : 'partial',
      count: savepointScan.totalMatched,
      detail: savepointScan.ok
        ? `${savepointScan.totalMatched} savepoint key(s) matched.`
        : `Savepoint scan degraded: ${savepointScan.error ?? 'unknown error'}`,
    }),
    source({
      id: 'hot_gi_state',
      layer: 5,
      label: 'Hot GI state',
      status: gi ? 'available' : giCarry ? 'partial' : 'missing',
      count: gi ? 1 : giCarry ? 1 : 0,
      detail: gi ? `GI live row available (${gi.global_integrity}).` : giCarry ? `GI carry row available (${giCarry.global_integrity}).` : 'No GI row available.',
    }),
    source({
      id: 'hot_signal_state',
      layer: 6,
      label: 'Hot signal snapshot',
      status: signal ? 'available' : 'missing',
      count: signal?.allSignals?.length ?? 0,
      detail: signal ? `${signal.allSignals?.length ?? 0} signal row(s) available.` : 'No signal snapshot available.',
    }),
    source({
      id: 'echo_tripwire_state',
      layer: 7,
      label: 'ECHO / Tripwire state',
      status: echo && tripwire ? 'available' : echo || tripwire ? 'partial' : 'missing',
      count: Number(Boolean(echo)) + Number(Boolean(tripwire)),
      detail: `ECHO=${echo ? 'yes' : 'no'}, Tripwire=${tripwire ? 'yes' : 'no'}.`,
    }),
    source({
      id: 'kv_runtime',
      layer: 8,
      label: 'KV runtime availability',
      status: health.available ? 'available' : health.backup_redis.available ? 'partial' : 'unsafe',
      count: health.available ? 1 : 0,
      detail: health.available
        ? `Primary KV available (${health.latencyMs}ms).`
        : health.backup_redis.available
          ? 'Primary KV unavailable; backup Redis reports available.'
          : `KV unavailable: ${health.error ?? 'unknown error'}`,
    }),
  ];

  const unsafeToRestore: string[] = [];
  if (!health.available && !health.backup_redis.available) unsafeToRestore.push('hot_state_writeback_requires_available_kv');
  if (finalizedSeals === 0 && !latestSeal) unsafeToRestore.push('vault_chain_has_no_finalized_seals');
  if (!gi && !giCarry) unsafeToRestore.push('gi_state_missing');

  const canRestoreVaultState = finalizedSeals > 0 || candidate !== null || inProgressBalance > 0 || inProgressHashes.length > 0;
  const canRestoreHotState = Boolean(gi || giCarry || signal || echo || tripwire);
  const canRestoreSavepoints = savepointScan.ok && savepointScan.totalMatched > 0;
  const confidence = confidenceFromSources(sources);

  const wouldRestore: string[] = [];
  if (canRestoreVaultState) wouldRestore.push('vault.reserve_blocks');
  if (candidate) wouldRestore.push('quorum.candidate');
  if (canRestoreHotState) wouldRestore.push('hot.gi_signals_echo_tripwire');
  if (canRestoreSavepoints) wouldRestore.push('chambers.savepoints');
  if (latestSeal?.substrate_attestation_id || latestSeal?.substrate_event_hash) wouldRestore.push('substrate.latest_pointer');

  return {
    ok: true,
    version: REPLAY_SYSTEM_VERSION,
    timestamp: new Date().toISOString(),
    cycle: gi?.timestamp ? currentCycleId() : currentCycleId(),
    mode,
    destructive: false,
    sources,
    rebuild: {
      possible: unsafeToRestore.length === 0 && (canRestoreVaultState || canRestoreHotState || canRestoreSavepoints),
      confidence,
      can_restore_hot_state: canRestoreHotState,
      can_restore_vault_state: canRestoreVaultState,
      can_restore_chamber_savepoints: canRestoreSavepoints,
      unsafe_to_restore: unsafeToRestore,
      would_restore: wouldRestore,
    },
    vault: {
      in_progress_balance: Number(inProgressBalance.toFixed(6)),
      in_progress_hash_count: inProgressHashes.length,
      attested_seals: attestedSeals,
      quarantined_seals: recentSeals.filter((s) => s.status === 'quarantined').length,
      finalized_seals: finalizedSeals,
      latest_seal_id: latestSeal?.seal_id ?? null,
      latest_seal_hash: latestSeal?.seal_hash ?? null,
      candidate_seal_id: candidate?.seal_id ?? null,
      recent_seals: recentSeals.map((seal) => ({
        seal_id: seal.seal_id,
        sequence: seal.sequence,
        status: seal.status,
        seal_hash: seal.seal_hash,
        prev_seal_hash: seal.prev_seal_hash,
        substrate_attestation_id: seal.substrate_attestation_id ?? null,
        substrate_event_hash: seal.substrate_event_hash ?? null,
      })),
      quarantined_seal_ids: recentSeals
        .filter((s) => s.status === 'quarantined')
        .map((s) => s.seal_id),
    },
    hot_state: {
      gi_available: Boolean(gi),
      gi_carry_available: Boolean(giCarry),
      signal_available: Boolean(signal),
      echo_available: Boolean(echo),
      tripwire_available: Boolean(tripwire),
    },
    savepoints: {
      total_matched: savepointScan.totalMatched,
      sampled: savepointScan.keys.length,
    },
    canon: 'Hot state can fail. Canon must survive. Replay is how Mobius remembers itself without mutating live state.',
  };
}
