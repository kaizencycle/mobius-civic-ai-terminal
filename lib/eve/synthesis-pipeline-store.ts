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

/** Per-cycle sequence for EPICON-CNNN-EVE-SYN-01 style IDs (resets on cold start). */
const eveSynthesisSeqByCycle = new Map<string, number>();

function normalizeCycleSegment(cycleId: string): string {
  const trimmed = cycleId.trim().toUpperCase();
  const m = /^C-(\d+)$/.exec(trimmed);
  if (m) {
    return `C-${m[1]}`;
  }
  const digits = trimmed.replace(/[^0-9]/g, '');
  if (!digits) {
    return 'C-0';
  }
  return `C-${digits}`;
}

/** EPICON-[C-NNN]-EVE-SYN-01, EPICON-[C-NNN]-EVE-SYN-02, … per server instance (C-626). */
export function allocateEveSynthesisEpiconId(cycleId: string): string {
  const normalized = normalizeCycleSegment(cycleId);
  const next = (eveSynthesisSeqByCycle.get(normalized) ?? 0) + 1;
  eveSynthesisSeqByCycle.set(normalized, next);
  const seq = String(next).padStart(2, '0');
  return `EPICON-${normalized}-EVE-SYN-${seq}`;
}

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
