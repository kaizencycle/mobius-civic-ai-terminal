import type { SubstrateJournalEntry } from '@/lib/substrate/github-journal';
import type { TripwireSeverity } from '@/lib/tripwire/types';

type JournalQualityDriftCheck = {
  triggered: boolean;
  severity: TripwireSeverity;
  weakCount: number;
  affectedAgents: string[];
};

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  return a.trim().toLowerCase() === b.trim().toLowerCase() ? 1 : 0;
}

export function checkJournalQualityDrift(entries: SubstrateJournalEntry[]): JournalQualityDriftCheck {
  const byAgent = new Map<string, SubstrateJournalEntry[]>();

  for (const entry of entries) {
    if (!entry.agent) continue;
    const rows = byAgent.get(entry.agent) ?? [];
    rows.push(entry);
    byAgent.set(entry.agent, rows);
  }

  const weakAgents: string[] = [];

  for (const [agent, rows] of byAgent.entries()) {
    const recent = [...rows]
      .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
      .slice(0, 5);

    if (recent.length < 2) continue;

    const tooShort = recent.filter((entry) => {
      const totalWords =
        wordCount(entry.observation ?? '') +
        wordCount(entry.inference ?? '') +
        wordCount(entry.recommendation ?? '');
      return totalWords < 30;
    }).length;

    const repetitive = recent
      .slice(1)
      .filter((entry, index) => similarity(entry.observation ?? '', recent[index].observation ?? '') > 0.95).length;

    const sparseDerived = recent.filter((entry) => !entry.derivedFrom || entry.derivedFrom.length < 1).length;

    if (tooShort >= 3 || repetitive >= 2 || sparseDerived >= 3) {
      weakAgents.push(agent);
    }
  }

  const weakCount = weakAgents.length;

  return {
    triggered: weakCount > 0,
    severity: weakCount > 2 ? 'critical' : weakCount > 0 ? 'elevated' : 'nominal',
    weakCount,
    affectedAgents: weakAgents,
  };
}
