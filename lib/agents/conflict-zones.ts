import type { LedgerEntry } from '@/lib/terminal/types';
import { computeLedgerTrustProfile } from './trust-weight';

export type ConflictSeverity = 'none' | 'low' | 'medium' | 'high';

export type ConflictZone = {
  key: string;
  cycleId: string;
  category: string;
  entries: number;
  agents: string[];
  statuses: string[];
  canonStates: string[];
  proofSources: string[];
  averageTrust: number;
  conflictScore: number;
  severity: ConflictSeverity;
  reasons: string[];
};

function groupKey(entry: LedgerEntry): string {
  return `${entry.cycleId}:${entry.category ?? 'unknown'}:${entry.type}`;
}

function unique(values: Array<string | undefined | null>): string[] {
  return Array.from(new Set(values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)));
}

function classify(score: number): ConflictSeverity {
  if (score >= 0.75) return 'high';
  if (score >= 0.45) return 'medium';
  if (score > 0) return 'low';
  return 'none';
}

function detectReasons(entries: LedgerEntry[]): string[] {
  const statuses = unique(entries.map((entry) => entry.status));
  const canonStates = unique(entries.map((entry) => entry.canonState));
  const alignments = unique(entries.map((entry) => entry.cycleAlignment));
  const reasons: string[] = [];

  if (statuses.includes('committed') && statuses.includes('reverted')) reasons.push('committed_and_reverted_present');
  if (canonStates.includes('attested') && canonStates.includes('blocked')) reasons.push('attested_and_blocked_present');
  if (canonStates.includes('sealed') && canonStates.includes('blocked')) reasons.push('sealed_and_blocked_present');
  if (alignments.includes('attested') && alignments.includes('unknown')) reasons.push('known_and_unknown_cycle_alignment');
  if (unique(entries.map((entry) => entry.agentOrigin)).length <= 1 && entries.length > 1) reasons.push('single_agent_repetition');

  return reasons;
}

export function detectConflictZones(entries: LedgerEntry[]): ConflictZone[] {
  const groups = new Map<string, LedgerEntry[]>();

  for (const entry of entries) {
    const key = groupKey(entry);
    const list = groups.get(key) ?? [];
    list.push(entry);
    groups.set(key, list);
  }

  return Array.from(groups.entries())
    .map(([key, list]) => {
      const reasons = detectReasons(list);
      const agents = unique(list.map((entry) => entry.agentOrigin));
      const statuses = unique(list.map((entry) => entry.status));
      const canonStates = unique(list.map((entry) => entry.canonState));
      const proofSources = unique(list.map((entry) => entry.proofSource));
      const trusts = list.map((entry) => computeLedgerTrustProfile(entry).trustScore);
      const averageTrust = Number((trusts.reduce((sum, value) => sum + value, 0) / (trusts.length || 1)).toFixed(3));
      const diversityPenalty = agents.length <= 1 && list.length > 1 ? 0.2 : 0;
      const statusConflict = statuses.length > 1 ? 0.3 : 0;
      const canonConflict = canonStates.includes('blocked') && (canonStates.includes('attested') || canonStates.includes('sealed') || canonStates.includes('candidate')) ? 0.35 : 0;
      const cycleConflict = list.some((entry) => entry.cycleAlignment === 'unknown') ? 0.15 : 0;
      const reasonWeight = Math.min(0.4, reasons.length * 0.15);
      const conflictScore = Number(Math.min(1, statusConflict + canonConflict + cycleConflict + diversityPenalty + reasonWeight).toFixed(3));

      return {
        key,
        cycleId: list[0]?.cycleId ?? 'C-—',
        category: list[0]?.category ?? 'unknown',
        entries: list.length,
        agents,
        statuses,
        canonStates,
        proofSources,
        averageTrust,
        conflictScore,
        severity: classify(conflictScore),
        reasons,
      };
    })
    .filter((zone) => zone.severity !== 'none')
    .sort((a, b) => b.conflictScore - a.conflictScore || b.entries - a.entries);
}
