export type SynthesisDominantTheme =
  | 'geopolitical'
  | 'market'
  | 'infrastructure'
  | 'governance'
  | 'narrative';

export type SynthesisPatternType =
  | 'escalation'
  | 'de-escalation'
  | 'volatility'
  | 'stability'
  | 'convergence'
  | 'divergence';

export type SynthesisSeverity = 'low' | 'medium' | 'high';

export type SynthesisConfidenceTier = 1 | 2 | 3;

export type EveSynthesisPayload = {
  synthesis: string;
  dominantTheme: SynthesisDominantTheme;
  dominantRegion: string;
  patternType: SynthesisPatternType;
  confidenceTier: SynthesisConfidenceTier;
  epiconTitle: string;
  epiconSummary: string;
  flags: string[];
  severity: SynthesisSeverity;
};

export type ZeusSynthesisVerdict = 'confirmed' | 'flagged' | 'low-confidence' | 'contested';

export type EpiconCandidate = {
  id: string;
  cycleId: string;
  timestamp: string;
  source: 'eve-synthesis';
  status: 'pending-verification' | 'verified' | 'contested';
  title: string;
  summary: string;
  dominantTheme: SynthesisDominantTheme;
  dominantRegion: string;
  patternType: SynthesisPatternType;
  confidenceTier: SynthesisConfidenceTier;
  severity: SynthesisSeverity;
  flags: string[];
  fullSynthesis: string;
  agentOrigin: 'EVE';
  verifiedBy: 'ZEUS' | null;
  verifiedAt: string | null;
  zeusVerdict?: ZeusSynthesisVerdict;
};

const candidates: EpiconCandidate[] = [];

export function getPipelineCandidates(): EpiconCandidate[] {
  return candidates.slice();
}

export function getPipelineCandidateById(id: string): EpiconCandidate | null {
  return candidates.find((candidate) => candidate.id === id) ?? null;
}

export function addPipelineCandidate(candidate: EpiconCandidate): EpiconCandidate {
  candidates.unshift(candidate);
  if (candidates.length > 200) {
    candidates.length = 200;
  }
  return candidate;
}

export function updatePipelineCandidate(candidateId: string, updates: Partial<EpiconCandidate>): EpiconCandidate | null {
  const idx = candidates.findIndex((candidate) => candidate.id === candidateId);
  if (idx === -1) {
    return null;
  }

  const updated = { ...candidates[idx], ...updates };
  candidates[idx] = updated;
  return updated;
}

export function removePipelineCandidate(candidateId: string): boolean {
  const idx = candidates.findIndex((candidate) => candidate.id === candidateId);
  if (idx === -1) {
    return false;
  }
  candidates.splice(idx, 1);
  return true;
}
