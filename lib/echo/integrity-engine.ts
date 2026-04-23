/**
 * ECHO Integrity Engine
 *
 * Implements the Mobius-Substrate integrity rating pattern where four
 * sentinel agents collaboratively score each EPICON event:
 *
 *   ATLAS  — Infrastructure & system integrity assessment
 *   ZEUS   — Source verification & confidence validation
 *   JADE   — Pattern analysis & sentiment/morale signal
 *   EVE    — Ethics & bias evaluation
 *
 * Formulas derived from Mobius-Substrate integrity-core:
 *
 *   MII (Mobius Integrity Index)  = weighted avg of agent scores (0–1)
 *   GI Delta                      = Σ integrityDelta from rated events
 *   MIC (Mobius Integrity Credits) = max(0, S * (MII - τ))
 *     where S = shard value, τ = 0.95 threshold
 *
 * Shard weights (from integrity-core/src/mic/shardWeights.ts):
 *   reflection: 1.0, learning: 1.0, civic: 1.5, stability: 2.0,
 *   stewardship: 2.0, innovation: 2.5, guardian: 3.0
 */

import type { EpiconItem, CivicRadarAlert } from '@/lib/terminal/types';
import type { RawEvent } from './sources';

// ── Constants (from Mobius-Substrate integrity-core) ─────────

const MII_THRESHOLD = 0.95;
const MINT_COEFFICIENT = 1.0;

const SHARD_WEIGHTS: Record<string, number> = {
  reflection: 1.0,
  learning: 1.0,
  civic: 1.5,
  stability: 2.0,
  stewardship: 2.0,
  innovation: 2.5,
  guardian: 3.0,
};

// Map EPICON categories to shard types
const CATEGORY_TO_SHARD: Record<string, string> = {
  geopolitical: 'civic',
  market: 'stability',
  infrastructure: 'guardian',
  governance: 'stewardship',
};

// Agent weights for MII calculation
const AGENT_WEIGHTS = {
  ATLAS: 0.30,  // Infrastructure integrity — highest weight
  ZEUS: 0.25,   // Verification confidence
  EVE: 0.25,    // Ethics & bias
  JADE: 0.20,   // Pattern & morale
} as const;

// ── Types ────────────────────────────────────────────────────

export type AgentRating = {
  agent: string;
  score: number;       // 0–1
  weight: number;      // agent weight
  rationale: string;   // human-readable explanation
};

export type IntegrityRating = {
  eventId: string;
  timestamp: string;
  ratings: AgentRating[];
  mii: number;            // weighted avg of agent scores (0–1)
  integrityDelta: number; // net GI impact
  shardType: string;
  shardValue: number;
  micMinted: number;      // max(0, S * (MII - τ))
  verdict: 'verified' | 'flagged' | 'contested';
};

export type CycleIntegritySummary = {
  cycleId: string;
  timestamp: string;
  eventCount: number;
  avgMii: number;
  totalGiDelta: number;
  /** Sum of provisional MIC from integrity ratings (MIC_REWARD_V2 class); not circulation mint. */
  totalMicProvisional: number;
  /**
   * @deprecated C-285 — use `totalMicProvisional`. Same numeric value; removed in a later cycle.
   */
  totalMicMinted: number;
  agentAverages: Record<string, number>;
  ratings: IntegrityRating[];
};

// ── ATLAS: Infrastructure & system integrity ─────────────────

function rateATLAS(raw: RawEvent, epicon: EpiconItem): AgentRating {
  let score: number;
  let rationale: string;

  if (raw.category === 'infrastructure') {
    // ATLAS specializes in infrastructure — rate based on magnitude/severity
    const mag = (raw.metadata?.magnitude as number) ?? 0;
    if (raw.severity === 'high' || mag >= 6) {
      score = 0.60;
      rationale = `High-severity infrastructure event (mag ${mag.toFixed(1)}). Integrity substrate impact detected. Priority review initiated.`;
    } else if (raw.severity === 'medium' || mag >= 4) {
      score = 0.82;
      rationale = `Moderate infrastructure signal (mag ${mag.toFixed(1)}). System integrity within tolerance. Monitoring escalation thresholds.`;
    } else {
      score = 0.95;
      rationale = `Low-severity infrastructure event. No substrate impact detected. Integrity baseline maintained.`;
    }
  } else {
    // Non-infrastructure events — ATLAS assesses system-level impact
    if (raw.severity === 'high') {
      score = 0.75;
      rationale = `High-severity ${raw.category} event may cascade to infrastructure layer. Cross-domain monitoring active.`;
    } else if (raw.severity === 'medium') {
      score = 0.88;
      rationale = `${raw.category} event assessed. No immediate substrate impact. Integrity context updated.`;
    } else {
      score = 0.96;
      rationale = `Routine ${raw.category} signal. Substrate integrity nominal. No action required.`;
    }
  }

  // Boost for multi-source verification
  if (epicon.sources.length > 1) score = Math.min(1, score + 0.02);

  return { agent: 'ATLAS', score, weight: AGENT_WEIGHTS.ATLAS, rationale };
}

// ── ZEUS: Source verification & confidence ───────────────────

function rateZEUS(raw: RawEvent, epicon: EpiconItem): AgentRating {
  let score: number;
  let rationale: string;

  const sourceCount = epicon.sources.length;
  const confidence = epicon.confidenceTier;

  if (confidence >= 3) {
    score = sourceCount > 1 ? 0.92 : 0.85;
    rationale = `Confidence T${confidence} — ${sourceCount > 1 ? 'multi-source corroborated' : 'single-source, pending cross-verification'}. Source chain ${raw.source} assessed.`;
  } else if (confidence >= 2) {
    score = sourceCount > 1 ? 0.88 : 0.80;
    rationale = `Confidence T${confidence} — moderate verification depth. Source ${raw.source} chain validated. ${sourceCount > 1 ? 'Corroboration detected.' : 'Awaiting secondary source.'}`;
  } else {
    score = 0.94;
    rationale = `Confidence T${confidence} — low-risk signal. Standard verification lane. Source chain clean.`;
  }

  // Penalize if URL is missing (less verifiable)
  if (!raw.url) {
    score = Math.max(0, score - 0.05);
    rationale += ' No source URL — verification limited.';
  }

  return { agent: 'ZEUS', score, weight: AGENT_WEIGHTS.ZEUS, rationale };
}

// ── JADE: Pattern analysis & morale/sentiment ────────────────

function rateJADE(raw: RawEvent, _epicon: EpiconItem): AgentRating {
  let score: number;
  let rationale: string;

  const hasNegativeSignal = /conflict|crisis|crash|earthquake|tsunami|collapse|war|attack/i.test(raw.title + ' ' + raw.summary);
  const hasPositiveSignal = /recovery|growth|cooperation|peace|innovation|gain|surge/i.test(raw.title + ' ' + raw.summary);

  const mag = typeof raw.metadata?.magnitude === 'number' ? raw.metadata.magnitude : 0;
  const isRoutineSeismic = hasNegativeSignal && raw.category === 'infrastructure' && mag > 0 && mag < 4.0 && raw.severity === 'low';

  if (isRoutineSeismic) {
    score = 0.90;
    rationale = `Routine low-magnitude seismic activity (M${mag.toFixed(1)}). Background noise — no civic morale impact.`;
  } else if (hasNegativeSignal && raw.severity === 'high') {
    score = 0.65;
    rationale = `Negative pattern amplification detected. Morale impact assessment: significant. Annotation flagged for reflection input.`;
  } else if (hasNegativeSignal) {
    score = 0.78;
    rationale = `Negative signal present but contained. Pattern coherence moderate. Morale vector: cautionary.`;
  } else if (hasPositiveSignal) {
    score = 0.95;
    rationale = `Positive pattern coherence detected. Morale vector: constructive. Civic sentiment aligned.`;
  } else {
    score = 0.87;
    rationale = `Neutral pattern. No significant morale vector. Standard annotation recorded.`;
  }

  // Market events get sentiment weighting
  if (raw.category === 'market') {
    const change = Math.abs((raw.metadata?.change24h as number) ?? 0);
    if (change > 8) {
      score = Math.max(0.5, score - 0.10);
      rationale += ` Market volatility ${change.toFixed(1)}% — elevated civic anxiety signal.`;
    } else if (change > 3) {
      score = Math.max(0.6, score - 0.05);
      rationale += ` Market movement ${change.toFixed(1)}% — moderate attention.`;
    }
  }

  return { agent: 'JADE', score, weight: AGENT_WEIGHTS.JADE, rationale };
}

// ── EVE: Ethics & bias evaluation ────────────────────────────

function rateEVE(raw: RawEvent, epicon: EpiconItem): AgentRating {
  let score: number;
  let rationale: string;

  // EVE evaluates ethical dimensions and potential bias
  const isManipulationRisk = raw.category === 'geopolitical' && raw.severity === 'high';
  const isPrivacyRisk = raw.category === 'infrastructure' && /surveillance|tracking|privacy/i.test(raw.title + ' ' + raw.summary);
  const isGovernanceRisk = raw.category === 'governance' && raw.severity !== 'low';

  if (isManipulationRisk) {
    score = 0.70;
    rationale = `High-severity geopolitical signal — manipulation/misinformation risk elevated. Ethical compliance review active. Bias scan initiated.`;
  } else if (isPrivacyRisk) {
    score = 0.72;
    rationale = `Privacy-adjacent infrastructure event detected. Civil liberties assessment flagged. Monitoring for scope creep.`;
  } else if (isGovernanceRisk) {
    score = 0.78;
    rationale = `Governance event with ethical dimensions. Democratic integrity check active. Bias detection nominal.`;
  } else if (raw.severity === 'high') {
    score = 0.80;
    rationale = `High-severity event — ethics observer heightened. No immediate ethical violation. Monitoring for downstream impact.`;
  } else {
    score = 0.93;
    rationale = `Standard ethical clearance. No bias detected in source chain. Compliance nominal across ${epicon.sources.length} source(s).`;
  }

  return { agent: 'EVE', score, weight: AGENT_WEIGHTS.EVE, rationale };
}

// ── MII Calculation ──────────────────────────────────────────

function calculateMII(ratings: AgentRating[]): number {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const r of ratings) {
    weightedSum += r.score * r.weight;
    totalWeight += r.weight;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

// ── MIC Minting (from Mobius-Substrate formula) ──────────────
// MIC_minted = max(0, S * (MII - τ)) where τ = 0.95

function calculateMIC(mii: number, shardValue: number): number {
  if (mii <= MII_THRESHOLD) return 0;
  return Math.max(0, shardValue * MINT_COEFFICIENT * (mii - MII_THRESHOLD));
}

// ── Integrity Delta (net GI impact) ──────────────────────────

function calculateIntegrityDelta(mii: number, severity: RawEvent['severity']): number {
  // Base delta from MII distance to threshold
  const miiDelta = (mii - MII_THRESHOLD) * 0.1;

  // Severity modifier
  const severityMod =
    severity === 'high' ? -0.01 :
    severity === 'medium' ? 0.005 :
    0.01;

  return Number((miiDelta + severityMod).toFixed(4));
}

// ── Verdict ──────────────────────────────────────────────────

function determineVerdict(mii: number, ratings: AgentRating[]): IntegrityRating['verdict'] {
  // Contested if any agent scores below 0.70
  if (ratings.some(r => r.score < 0.70)) return 'contested';
  // Flagged if MII below threshold or any agent below 0.80
  if (mii < MII_THRESHOLD || ratings.some(r => r.score < 0.80)) return 'flagged';
  // Verified
  return 'verified';
}

// ── Public API ───────────────────────────────────────────────

export function rateEvent(raw: RawEvent, epicon: EpiconItem): IntegrityRating {
  const ratings: AgentRating[] = [
    rateATLAS(raw, epicon),
    rateZEUS(raw, epicon),
    rateJADE(raw, epicon),
    rateEVE(raw, epicon),
  ];

  const mii = calculateMII(ratings);
  const shardType = CATEGORY_TO_SHARD[raw.category] ?? 'civic';
  const shardValue = SHARD_WEIGHTS[shardType] ?? 1.0;
  const micMinted = calculateMIC(mii, shardValue);
  const integrityDelta = calculateIntegrityDelta(mii, raw.severity);
  const verdict = determineVerdict(mii, ratings);

  return {
    eventId: epicon.id,
    timestamp: new Date().toISOString(),
    ratings,
    mii,
    integrityDelta,
    shardType,
    shardValue,
    micMinted,
    verdict,
  };
}

export function rateBatch(
  events: RawEvent[],
  epiconItems: EpiconItem[],
  cycleId: string,
): CycleIntegritySummary {
  const ratings: IntegrityRating[] = [];

  for (let i = 0; i < events.length; i++) {
    if (epiconItems[i]) {
      ratings.push(rateEvent(events[i], epiconItems[i]));
    }
  }

  const eventCount = ratings.length;
  const avgMii = eventCount > 0
    ? ratings.reduce((sum, r) => sum + r.mii, 0) / eventCount
    : 0;
  const totalGiDelta = ratings.reduce((sum, r) => sum + r.integrityDelta, 0);
  const totalMicProvisional = ratings.reduce((sum, r) => sum + r.micMinted, 0);

  // Agent averages
  const agentSums: Record<string, { total: number; count: number }> = {};
  for (const rating of ratings) {
    for (const ar of rating.ratings) {
      if (!agentSums[ar.agent]) agentSums[ar.agent] = { total: 0, count: 0 };
      agentSums[ar.agent].total += ar.score;
      agentSums[ar.agent].count += 1;
    }
  }
  const agentAverages: Record<string, number> = {};
  for (const [agent, { total, count }] of Object.entries(agentSums)) {
    agentAverages[agent] = total / count;
  }

  return {
    cycleId,
    timestamp: new Date().toISOString(),
    eventCount,
    avgMii,
    totalGiDelta: Number(totalGiDelta.toFixed(4)),
    totalMicProvisional: Number(totalMicProvisional.toFixed(6)),
    totalMicMinted: Number(totalMicProvisional.toFixed(6)),
    agentAverages,
    ratings,
  };
}
