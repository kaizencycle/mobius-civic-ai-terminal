/**
 * In-memory store for EVE → EPICON synthesis pipeline candidates (C-626).
 * Resets on cold start; replace with KV in a later cycle.
 */

export type ZeusSynthesisVerdict = 'confirmed' | 'flagged' | 'low-confidence' | 'contested';

export type EveSynthesisPayload = {
  synthesis: string;
  dominantTheme: string;
  dominantRegion: string;
  patternType: string;
  confidenceTier: number;
  epiconTitle: string;
  epiconSummary: string;
  flags: string[];
  severity: string;
};

export type EveSynthesisCandidate = {
  id: string;
  cycleId: string;
  timestamp: string;
  source: 'eve-synthesis';
  status: 'pending-verification' | 'verified';
  title: string;
  summary: string;
  dominantTheme: string;
  dominantRegion: string;
  patternType: string;
  confidenceTier: number;
  severity: string;
  flags: string[];
  fullSynthesis: string;
  agentOrigin: 'EVE';
  verifiedBy: string | null;
  verifiedAt: string | null;
  zeusVerdict?: ZeusSynthesisVerdict;
};

const store: EveSynthesisCandidate[] = [];

export function addEveSynthesisCandidate(candidate: EveSynthesisCandidate): void {
  store.unshift(candidate);
  if (store.length > 100) {
    store.length = 100;
  }
}

export function getEveSynthesisCandidates(): EveSynthesisCandidate[] {
  return store;
}

export function getEveSynthesisCandidateById(id: string): EveSynthesisCandidate | undefined {
  return store.find((c) => c.id === id);
}

export function updateEveSynthesisCandidate(
  id: string,
  patch: Partial<EveSynthesisCandidate>,
): EveSynthesisCandidate | undefined {
  const idx = store.findIndex((c) => c.id === id);
  if (idx === -1) return undefined;
  const next = { ...store[idx], ...patch };
  store[idx] = next;
  return next;
}

export function removeEveSynthesisCandidate(id: string): boolean {
  const idx = store.findIndex((c) => c.id === id);
  if (idx === -1) return false;
  store.splice(idx, 1);
  return true;
}
