import type { LedgerCycleAlignment, LedgerEntry } from '@/lib/terminal/types';

export type LedgerTrustBand = 'strong' | 'usable' | 'weak' | 'blocked';

export type LedgerTrustProfile = {
  trustScore: number;
  trustBand: LedgerTrustBand;
  alignmentWeight: number;
  proofWeight: number;
  confidenceWeight: number;
  reasons: string[];
};

export type AgentTrustProfile = {
  agent: string;
  entries: number;
  averageTrust: number;
  strong: number;
  usable: number;
  weak: number;
  blocked: number;
};

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

export function getCycleAlignmentWeight(alignment?: LedgerCycleAlignment): number {
  if (alignment === 'attested') return 1;
  if (alignment === 'inferred') return 0.6;
  if (alignment === 'unknown') return 0.2;
  return 0.2;
}

export function getProofWeight(entry: LedgerEntry): number {
  if (entry.status === 'reverted' || entry.canonState === 'blocked') return 0;
  if (entry.canonState === 'sealed' || entry.canonState === 'attested') return 1;
  if (entry.canonState === 'candidate') return 0.75;
  if (entry.status === 'committed') return 0.65;
  if (entry.canonState === 'hot') return 0.4;
  return 0.3;
}

export function getConfidenceWeight(entry: LedgerEntry): number {
  if (typeof entry.confidenceTier === 'number') return clamp(entry.confidenceTier / 4);
  return entry.status === 'committed' ? 0.65 : 0.35;
}

function trustBand(score: number): LedgerTrustBand {
  if (score >= 0.8) return 'strong';
  if (score >= 0.55) return 'usable';
  if (score > 0) return 'weak';
  return 'blocked';
}

export function computeLedgerTrustProfile(entry: LedgerEntry): LedgerTrustProfile {
  const alignmentWeight = getCycleAlignmentWeight(entry.cycleAlignment);
  const proofWeight = getProofWeight(entry);
  const confidenceWeight = getConfidenceWeight(entry);
  const trustScore = Number((alignmentWeight * 0.4 + proofWeight * 0.4 + confidenceWeight * 0.2).toFixed(3));
  const reasons = [
    `alignment:${entry.cycleAlignment ?? 'unknown'}=${alignmentWeight}`,
    `proof:${entry.canonState ?? entry.status}=${proofWeight}`,
    `confidence:${entry.confidenceTier ?? 'fallback'}=${confidenceWeight}`,
  ];

  return {
    trustScore,
    trustBand: trustBand(trustScore),
    alignmentWeight,
    proofWeight,
    confidenceWeight,
    reasons,
  };
}

export function summarizeAgentTrust(entries: LedgerEntry[]): AgentTrustProfile[] {
  const byAgent = new Map<string, { total: number; score: number; strong: number; usable: number; weak: number; blocked: number }>();

  for (const entry of entries) {
    const agent = (entry.agentOrigin || 'UNKNOWN').toUpperCase();
    const profile = computeLedgerTrustProfile(entry);
    const row = byAgent.get(agent) ?? { total: 0, score: 0, strong: 0, usable: 0, weak: 0, blocked: 0 };
    row.total += 1;
    row.score += profile.trustScore;
    row[profile.trustBand] += 1;
    byAgent.set(agent, row);
  }

  return Array.from(byAgent.entries())
    .map(([agent, row]) => ({
      agent,
      entries: row.total,
      averageTrust: Number((row.total > 0 ? row.score / row.total : 0).toFixed(3)),
      strong: row.strong,
      usable: row.usable,
      weak: row.weak,
      blocked: row.blocked,
    }))
    .sort((a, b) => b.averageTrust - a.averageTrust || b.entries - a.entries);
}
