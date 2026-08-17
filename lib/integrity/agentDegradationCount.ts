/**
 * C-406 — count agents with degraded lane health from KV signal snapshot.
 * Returns null when snapshot is unavailable (unknown — not zero).
 */

import { loadSignalSnapshot } from '@/lib/kv/store';

export async function countDegradedAgentsFromSignalSnapshot(): Promise<number | null> {
  const snapshot = await loadSignalSnapshot();
  if (!snapshot?.allSignals?.length) {
    return null;
  }

  const byAgent = new Map<string, boolean>();
  for (const signal of snapshot.allSignals) {
    const agent = signal.agentName;
    const nominal =
      signal.severity === 'nominal' || (typeof signal.value === 'number' && signal.value >= 0.75);
    if (nominal) {
      byAgent.set(agent, true);
    } else if (!byAgent.has(agent)) {
      byAgent.set(agent, false);
    }
  }

  let degraded = 0;
  for (const hasNominal of byAgent.values()) {
    if (!hasNominal) degraded += 1;
  }
  return degraded;
}
