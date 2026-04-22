import type { SubstrateJournalEntry } from '@/lib/substrate/github-journal';
import type { TripwireSeverity } from '@/lib/tripwire/types';

type ProvenanceBreakCheck = {
  triggered: boolean;
  severity: TripwireSeverity;
  missingCount: number;
  affectedAgents: string[];
};

type TemporalCoherenceCheck = {
  triggered: boolean;
  severity: TripwireSeverity;
  totalViolations: number;
  affectedAgents: string[];
};

export function checkProvenanceBreak(entries: SubstrateJournalEntry[]): ProvenanceBreakCheck {
  const bad = entries.filter((entry) => {
    const source = typeof entry.source === 'string' ? entry.source.trim() : '';
    const derived = Array.isArray(entry.derivedFrom) ? entry.derivedFrom.filter(Boolean) : [];
    return source.length === 0 || derived.length === 0;
  });

  const affectedAgents = [...new Set(bad.map((entry) => entry.agent).filter(Boolean))];
  const missingCount = bad.length;

  return {
    triggered: missingCount > 0,
    severity: missingCount > 10 ? 'critical' : missingCount > 0 ? 'elevated' : 'nominal',
    missingCount,
    affectedAgents,
  };
}

export function checkTemporalCoherence(entries: SubstrateJournalEntry[]): TemporalCoherenceCheck {
  let outOfOrder = 0;
  let invalidCycles = 0;
  const affectedAgents = new Set<string>();

  for (let index = 1; index < entries.length; index += 1) {
    const current = entries[index];
    const previous = entries[index - 1];
    const currentTs = Date.parse(current.timestamp);
    const previousTs = Date.parse(previous.timestamp);
    if (Number.isFinite(currentTs) && Number.isFinite(previousTs) && currentTs > previousTs) {
      outOfOrder += 1;
      if (current.agent) affectedAgents.add(current.agent);
      if (previous.agent) affectedAgents.add(previous.agent);
    }
  }

  for (const entry of entries) {
    const cycle = typeof entry.cycle === 'string' ? entry.cycle.trim() : '';
    if (!/^C-\d+$/.test(cycle)) {
      invalidCycles += 1;
      if (entry.agent) affectedAgents.add(entry.agent);
    }
  }

  const totalViolations = outOfOrder + invalidCycles;

  return {
    triggered: totalViolations > 0,
    severity: totalViolations > 5 ? 'critical' : totalViolations > 0 ? 'elevated' : 'nominal',
    totalViolations,
    affectedAgents: [...affectedAgents],
  };
}
