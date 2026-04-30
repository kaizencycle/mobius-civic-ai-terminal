import type { LedgerEntry } from '@/lib/terminal/types';
import { computeLedgerTrustProfile } from './trust-weight';

export type QuorumResult = {
  key: string;
  entries: number;
  agents: string[];
  averageTrust: number;
  quorumScore: number;
  authorized: boolean;
  authorizationReason: string;
};

export type QuorumAuthorityDecision = {
  authorized: boolean;
  quorumScore: number;
  agentCount: number;
  threshold: number;
  minimumAgents: number;
  reason: string;
};

const DEFAULT_QUORUM_SCORE_THRESHOLD = 0.55;
const DEFAULT_MINIMUM_AGENTS = 2;

function groupKey(entry: LedgerEntry): string {
  return `${entry.cycleId}:${entry.type}:${entry.category ?? 'unknown'}`;
}

function authority(score: number, agentCount: number, threshold = DEFAULT_QUORUM_SCORE_THRESHOLD, minimumAgents = DEFAULT_MINIMUM_AGENTS): QuorumAuthorityDecision {
  if (agentCount < minimumAgents) {
    return {
      authorized: false,
      quorumScore: score,
      agentCount,
      threshold,
      minimumAgents,
      reason: 'insufficient_agent_diversity',
    };
  }
  if (score < threshold) {
    return {
      authorized: false,
      quorumScore: score,
      agentCount,
      threshold,
      minimumAgents,
      reason: 'quorum_score_below_threshold',
    };
  }
  return {
    authorized: true,
    quorumScore: score,
    agentCount,
    threshold,
    minimumAgents,
    reason: 'quorum_authorized',
  };
}

export function computeQuorum(entries: LedgerEntry[]): QuorumResult[] {
  const groups = new Map<string, { entries: LedgerEntry[]; agents: Set<string> }>();

  for (const entry of entries) {
    const key = groupKey(entry);
    const g = groups.get(key) ?? { entries: [], agents: new Set<string>() };
    g.entries.push(entry);
    g.agents.add(entry.agentOrigin || 'UNKNOWN');
    groups.set(key, g);
  }

  return Array.from(groups.entries()).map(([key, g]) => {
    const trusts = g.entries.map((e) => computeLedgerTrustProfile(e).trustScore);
    const avg = trusts.reduce((a, b) => a + b, 0) / (trusts.length || 1);
    const diversity = g.agents.size;
    const quorumScore = Number((avg * Math.min(1, diversity / 3)).toFixed(3));
    const decision = authority(quorumScore, diversity);

    return {
      key,
      entries: g.entries.length,
      agents: Array.from(g.agents),
      averageTrust: Number(avg.toFixed(3)),
      quorumScore,
      authorized: decision.authorized,
      authorizationReason: decision.reason,
    };
  }).sort((a, b) => b.quorumScore - a.quorumScore);
}

export function authorizeLedgerWriteByQuorum(entries: LedgerEntry[], agent: string, cycle: string): QuorumAuthorityDecision {
  const normalizedAgent = agent.toUpperCase();
  const relevantCycle = entries.filter((entry) => entry.cycleId === cycle);
  const groups = computeQuorum(relevantCycle);
  const candidateGroup = groups.find((group) => group.agents.includes(normalizedAgent));

  if (!candidateGroup) {
    return {
      authorized: false,
      quorumScore: 0,
      agentCount: 1,
      threshold: DEFAULT_QUORUM_SCORE_THRESHOLD,
      minimumAgents: DEFAULT_MINIMUM_AGENTS,
      reason: 'no_quorum_group_for_agent',
    };
  }

  return authority(candidateGroup.quorumScore, candidateGroup.agents.length);
}
