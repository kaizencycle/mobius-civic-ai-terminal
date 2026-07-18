/**
 * C-298 — Sentinel cycle quorum attestation request parsing.
 *
 * Distinct from vault SealCandidate attestation (`/api/vault/seal/attest`).
 * ZEUS and other sentinels POST { agent, cycle, confidence, source } to
 * register per-cycle quorum eligibility in `mic:quorum:<cycle>`.
 */

import {
  SENTINEL_QUORUM_AGENTS,
  type SentinelQuorumAgent,
} from '@/lib/mic/quorumTracker';

export type SentinelQuorumSubmission = {
  agent: SentinelQuorumAgent;
  cycle: string;
  confidence: number;
  source: string;
};

const CYCLE_RE = /^C-\d+$/;

export function parseSentinelQuorumSubmission(raw: unknown): SentinelQuorumSubmission | string {
  if (!raw || typeof raw !== 'object') return 'body must be an object';
  const r = raw as Record<string, unknown>;

  const agent = typeof r.agent === 'string' ? r.agent.trim().toUpperCase() : '';
  if (!SENTINEL_QUORUM_AGENTS.includes(agent as SentinelQuorumAgent)) {
    return `agent must be one of ${SENTINEL_QUORUM_AGENTS.join(', ')}`;
  }

  const cycle = typeof r.cycle === 'string' ? r.cycle.trim().toUpperCase() : '';
  if (!CYCLE_RE.test(cycle)) {
    return 'cycle must match C-<number> (e.g. C-376)';
  }

  if (typeof r.confidence !== 'number' || !Number.isFinite(r.confidence)) {
    return 'confidence must be a finite number';
  }
  if (r.confidence < 0 || r.confidence > 1) {
    return 'confidence must be between 0 and 1';
  }

  const source = typeof r.source === 'string' ? r.source.trim() : '';
  if (source.length === 0) {
    return 'source required';
  }
  if (source.length > 200) {
    return 'source must be at most 200 characters';
  }

  return {
    agent: agent as SentinelQuorumAgent,
    cycle,
    confidence: r.confidence,
    source,
  };
}
