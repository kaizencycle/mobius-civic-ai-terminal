import type { LedgerEntry } from '@/lib/terminal/types';
import { computeLedgerTrustProfile } from './trust-weight';

export type QuorumResult = {
  key: string;
  entries: number;
  agents: string[];
  averageTrust: number;
  quorumScore: number;
};

function groupKey(entry: LedgerEntry): string {
  return `${entry.cycleId}:${entry.type}:${entry.category ?? 'unknown'}`;
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

    // quorum = avg trust * agent diversity weight
    const diversity = g.agents.size;
    const quorumScore = Number((avg * Math.min(1, diversity / 3)).toFixed(3));

    return {
      key,
      entries: g.entries.length,
      agents: Array.from(g.agents),
      averageTrust: Number(avg.toFixed(3)),
      quorumScore,
    };
  }).sort((a, b) => b.quorumScore - a.quorumScore);
}
