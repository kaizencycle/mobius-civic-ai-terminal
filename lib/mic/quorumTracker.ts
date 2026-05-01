/**
 * C-298 — Sentinel Council Quorum State Tracker
 *
 * Tracks per-cycle quorum attestation state for the 5 Sentinel agents.
 * This is distinct from vault SealCandidate attestations — it records whether
 * each Sentinel has filed a journal in the current cycle, making them eligible
 * to contribute to quorum when a seal candidate forms.
 *
 * Key: mobius:mic:quorum:<cycle>  (e.g. mobius:mic:quorum:C-298)
 * TTL: 48 hours
 */

import { kvGet, kvSet } from '@/lib/kv/store';

export type SentinelQuorumAgent = 'ATLAS' | 'ZEUS' | 'EVE' | 'JADE' | 'AUREA';

export const SENTINEL_QUORUM_AGENTS: SentinelQuorumAgent[] = [
  'ATLAS', 'ZEUS', 'EVE', 'JADE', 'AUREA',
];

export type QuorumAgentEntry = {
  agent: SentinelQuorumAgent;
  attested: boolean;
  attested_at: string | null;
  confidence: number | null;
  source: string | null;
};

export type SentinelQuorumState = {
  schema: 'SENTINEL_QUORUM_V1';
  cycle: string;
  required: SentinelQuorumAgent[];
  entries: Partial<Record<SentinelQuorumAgent, QuorumAgentEntry>>;
  attestations_received: number;
  attestations_needed: number;
  status: 'pending' | 'in_progress' | 'achieved';
  initiated_at: string | null;
  completed_at: string | null;
  updatedAt: string;
};

const QUORUM_KEY = (cycle: string) => `mic:quorum:${cycle}`;
const QUORUM_TTL = 60 * 60 * 48; // 48h

function defaultState(cycle: string): SentinelQuorumState {
  return {
    schema: 'SENTINEL_QUORUM_V1',
    cycle,
    required: [...SENTINEL_QUORUM_AGENTS],
    entries: {},
    attestations_received: 0,
    attestations_needed: SENTINEL_QUORUM_AGENTS.length,
    status: 'pending',
    initiated_at: null,
    completed_at: null,
    updatedAt: new Date().toISOString(),
  };
}

export async function loadQuorumState(cycle: string): Promise<SentinelQuorumState> {
  const raw = await kvGet<SentinelQuorumState>(QUORUM_KEY(cycle));
  if (raw) return raw;
  return defaultState(cycle);
}

/**
 * Register a Sentinel agent attestation for the current cycle.
 * Idempotent: calling twice for the same agent in the same cycle is a no-op.
 */
export async function registerSentinelAttestation(
  cycle: string,
  agent: SentinelQuorumAgent,
  confidence: number,
  source: string,
): Promise<SentinelQuorumState> {
  const state = await loadQuorumState(cycle);

  // Idempotent — already registered
  if (state.entries[agent]?.attested) return state;

  const now = new Date().toISOString();
  state.entries[agent] = {
    agent,
    attested: true,
    attested_at: now,
    confidence: Number(confidence.toFixed(4)),
    source,
  };

  if (!state.initiated_at) state.initiated_at = now;

  // Count attested entries
  state.attestations_received = Object.values(state.entries).filter((e) => e?.attested).length;

  if (state.attestations_received >= state.attestations_needed) {
    state.status = 'achieved';
    if (!state.completed_at) state.completed_at = now;
  } else {
    state.status = 'in_progress';
  }

  state.updatedAt = now;
  await kvSet(QUORUM_KEY(cycle), state, QUORUM_TTL);
  return state;
}

/**
 * Mark a Sentinel agent as eligible for quorum based on a journal write.
 * Uses their journal confidence as the attestation confidence.
 */
export async function markAgentJournaled(
  cycle: string,
  agent: SentinelQuorumAgent,
  confidence: number,
): Promise<SentinelQuorumState> {
  return registerSentinelAttestation(cycle, agent, confidence, 'cron-journal');
}
