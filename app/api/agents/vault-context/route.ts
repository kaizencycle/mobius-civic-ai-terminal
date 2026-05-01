import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type FetchResult<T> = {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
};

type VaultStatus = {
  status?: string;
  vault_headline?: string;
  reserve_lane?: string;
  reserve_block_lane?: string;
  fountain_status?: string;
  in_progress_balance?: number;
  sealed_reserve_total?: number;
  current_tranche_balance?: number;
  reserve_block_progress_pct?: number;
  reserve_blocks_sealed?: number;
  reserve_blocks_audit?: number;
  seals_count?: number;
  seals_quarantined_count?: number;
  seals_needing_reattestation?: Array<{ seal_id: string; sequence: number; missing_agents: string[] }>;
  latest_seal_id?: string | null;
  latest_seal_hash?: string | null;
  latest_block_immortalized?: boolean;
  candidate_attestation_state?: {
    in_flight: boolean;
    seal_id: string | null;
    attestations_received: number;
    attestations_needed?: number;
    timeout_at: string | null;
  };
  gi_current?: number;
  gi_threshold?: number;
  sustain_cycles_current?: number;
  sustain_cycles_required?: number;
  sustain_cycles_met?: boolean;
  gi_threshold_met?: boolean;
};

type CanonPayload = {
  ok?: boolean;
  reserve_blocks?: unknown[];
  counts?: Record<string, number>;
  timeline?: unknown[];
};

type EffectiveStatePayload = {
  ok?: boolean;
  count?: number;
  counts?: Record<string, number>;
  effective?: unknown[];
};

type ReplayPlanPayload = {
  ok?: boolean;
  rebuild?: {
    possible: boolean;
    confidence: number;
    unsafe_to_restore: string[];
    would_restore: string[];
  };
  vault?: {
    attested_seals: number;
    quarantined_seals: number;
    finalized_seals: number;
    latest_seal_id: string | null;
    candidate_seal_id: string | null;
    quarantined_seal_ids: string[];
  };
  hot_state?: Record<string, boolean>;
  sources?: Array<{ id: string; layer: number; label: string; status: string; detail: string }>;
};

async function getJson<T>(request: NextRequest, path: string): Promise<FetchResult<T>> {
  try {
    const response = await fetch(new URL(path, request.nextUrl.origin), { cache: 'no-store' });
    const data = (await response.json()) as T;
    return {
      ok: response.ok,
      status: response.status,
      data: response.ok ? data : null,
      error: response.ok ? null : `http_${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: error instanceof Error ? error.message : 'fetch_failed',
    };
  }
}

function deriveAgentTasks(args: {
  vault: VaultStatus | null;
  replay: ReplayPlanPayload | null;
  canon: CanonPayload | null;
  effective: EffectiveStatePayload | null;
}): string[] {
  const tasks: string[] = [];
  const vault = args.vault;
  const replay = args.replay;

  if (!vault) tasks.push('VAULT_CONTEXT_MISSING: agents cannot reason about reserve state');
  if (!args.canon) tasks.push('CANON_CONTEXT_MISSING: agents cannot verify canonical reserve blocks');
  if (!replay) tasks.push('REPLAY_CONTEXT_MISSING: agents cannot evaluate replay quorum');

  if (vault?.seals_quarantined_count && vault.seals_quarantined_count > 0) {
    tasks.push('REPLAY_QUORUM_REQUIRED: quarantined seals need agent review and re-attestation context');
  }
  if (vault?.candidate_attestation_state?.in_flight) {
    tasks.push('CANDIDATE_ATTESTATION_IN_FLIGHT: agents should monitor missing attestations and timeout risk');
  }
  if (vault?.gi_threshold_met === false || vault?.sustain_cycles_met === false) {
    tasks.push('SUSTAIN_NOT_READY: agents should stabilize GI and clean-event streak before seal attempts');
  }
  if (replay?.rebuild && !replay.rebuild.possible) {
    tasks.push('REPLAY_REBUILD_BLOCKED: agents should inspect unsafe restore blockers');
  }
  if ((args.effective?.counts?.still_quarantined_effective ?? 0) > 0) {
    tasks.push('EFFECTIVE_CANON_HAS_QUARANTINE: agents should compare replay receipts before canon promotion');
  }

  return tasks.length > 0 ? tasks : ['NO_IMMEDIATE_AGENT_ACTION: vault/canon/replay context is readable'];
}

export async function GET(request: NextRequest) {
  const [vaultRes, canonRes, effectiveRes, replayRes] = await Promise.all([
    getJson<VaultStatus>(request, '/api/vault/status'),
    getJson<CanonPayload>(request, '/api/substrate/canon?type=reserve_blocks'),
    getJson<EffectiveStatePayload>(request, '/api/substrate/effective-state'),
    getJson<ReplayPlanPayload>(request, '/api/system/replay/plan'),
  ]);

  const vault = vaultRes.data;
  const canon = canonRes.data;
  const effective = effectiveRes.data;
  const replay = replayRes.data;
  const agentTasks = deriveAgentTasks({ vault, canon, effective, replay });

  return NextResponse.json(
    {
      ok: vaultRes.ok || canonRes.ok || replayRes.ok,
      version: 'C-297.phase4.agent-vault-context.v1',
      readonly: true,
      source: 'vault-canon-replay-agent-context',
      endpoints: {
        vault_status: { ok: vaultRes.ok, status: vaultRes.status, error: vaultRes.error },
        substrate_canon: { ok: canonRes.ok, status: canonRes.status, error: canonRes.error },
        effective_state: { ok: effectiveRes.ok, status: effectiveRes.status, error: effectiveRes.error },
        replay_plan: { ok: replayRes.ok, status: replayRes.status, error: replayRes.error },
      },
      vault: vault
        ? {
            status: vault.status ?? null,
            headline: vault.vault_headline ?? null,
            reserve_lane: vault.reserve_lane ?? null,
            reserve_block_lane: vault.reserve_block_lane ?? null,
            fountain_status: vault.fountain_status ?? null,
            in_progress_balance: vault.in_progress_balance ?? null,
            sealed_reserve_total: vault.sealed_reserve_total ?? null,
            current_tranche_balance: vault.current_tranche_balance ?? null,
            reserve_block_progress_pct: vault.reserve_block_progress_pct ?? null,
            reserve_blocks_sealed: vault.reserve_blocks_sealed ?? null,
            reserve_blocks_audit: vault.reserve_blocks_audit ?? null,
            seals_count: vault.seals_count ?? null,
            seals_quarantined_count: vault.seals_quarantined_count ?? null,
            seals_needing_reattestation: vault.seals_needing_reattestation ?? [],
            latest_seal_id: vault.latest_seal_id ?? null,
            latest_seal_hash: vault.latest_seal_hash ?? null,
            latest_block_immortalized: vault.latest_block_immortalized ?? false,
            candidate_attestation_state: vault.candidate_attestation_state ?? null,
            gi: {
              current: vault.gi_current ?? null,
              threshold: vault.gi_threshold ?? null,
              threshold_met: vault.gi_threshold_met ?? null,
            },
            sustain: {
              current: vault.sustain_cycles_current ?? null,
              required: vault.sustain_cycles_required ?? null,
              met: vault.sustain_cycles_met ?? null,
            },
          }
        : null,
      canon: canon
        ? {
            reserve_block_count: Array.isArray(canon.reserve_blocks) ? canon.reserve_blocks.length : null,
            counts: canon.counts ?? null,
            timeline_count: Array.isArray(canon.timeline) ? canon.timeline.length : null,
          }
        : null,
      effective_state: effective
        ? {
            count: effective.count ?? null,
            counts: effective.counts ?? null,
          }
        : null,
      replay: replay
        ? {
            rebuild: replay.rebuild ?? null,
            vault: replay.vault ?? null,
            hot_state: replay.hot_state ?? null,
            sources: replay.sources ?? [],
          }
        : null,
      agent_tasks: agentTasks,
      canon_law: [
        'Agents may inspect Vault, Canon, and Replay state before quorum reasoning.',
        'This endpoint is read-only and cannot seal, promote, mutate, or replay state.',
        'Replay quorum and Canon checks must preserve historical state; overlays may add receipts but must not rewrite history.',
      ],
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
        'X-Mobius-Source': 'agents-vault-context',
      },
    },
  );
}
