/**
 * Mobius Signal Engine
 *
 * Scores every EPICON event across three dimensions:
 *
 *   signal     — How well-verified is the underlying event?
 *   narrative  — How much narrative amplification surrounds it?
 *   volatility — How much market/system reaction is it causing?
 *
 * Classification:
 *   SIGNAL     — high signal, low narrative noise
 *   EMERGING   — real event, but narrative amplification is high
 *   DISTORTION — narrative dominates, signal is weak or unverified
 */

import type { EpiconItem } from '@/lib/terminal/types';

// ── Types ────────────────────────────────────────────────────

export type SignalClassification = 'SIGNAL' | 'EMERGING' | 'DISTORTION';

export type SignalScore = {
  eventId: string;
  title: string;
  category: EpiconItem['category'];
  signal: number;       // 0–1: verification strength
  narrative: number;    // 0–1: narrative amplification level
  volatility: number;   // 0–1: market/system reaction intensity
  classification: SignalClassification;
  divergence: number;   // narrative - signal (positive = narrative ahead of facts)
  summary: string;      // one-line human explanation
};

// ── Narrative detection keywords ─────────────────────────────

const AMPLIFICATION_KEYWORDS = [
  'ww3', 'world war', 'collapse', 'imminent', 'catastroph',
  'unprecedented', 'total', 'complete', 'guaranteed', 'reset',
  'end of', 'death of', 'destroy', 'annihilat', 'apocalyp',
];

const EMOTIONAL_KEYWORDS = [
  'shocking', 'terrifying', 'horrifying', 'unbelievable',
  'breaking', 'urgent', 'massive', 'explosive', 'panic',
  'flee', 'chaos', 'doom', 'fear',
];

const HEDGING_KEYWORDS = [
  'reportedly', 'allegedly', 'unconfirmed', 'sources say',
  'rumor', 'claim', 'speculation', 'unverified',
];

// ── Signal scoring ───────────────────────────────────────────

function scoreSignal(event: EpiconItem): number {
  let score = 0.5; // baseline

  // Confidence tier is the strongest signal indicator
  score += event.confidenceTier * 0.1; // T0=0, T1=+0.1, T2=+0.2, T3=+0.3, T4=+0.4

  // Multi-source corroboration
  if (event.sources.length >= 3) score += 0.12;
  else if (event.sources.length >= 2) score += 0.06;

  // Verified status
  if (event.status === 'verified') score += 0.08;
  if (event.status === 'contradicted') score -= 0.15;

  // Trace depth (more agent touches = more processing)
  if (event.trace.length >= 4) score += 0.05;

  // Hedging language in summary (signals incomplete verification)
  const text = (event.title + ' ' + event.summary).toLowerCase();
  const hedgeHits = HEDGING_KEYWORDS.filter(k => text.includes(k)).length;
  score -= hedgeHits * 0.06;

  return Math.max(0, Math.min(1, score));
}

// ── Narrative scoring ────────────────────────────────────────

function scoreNarrative(event: EpiconItem): number {
  const text = (event.title + ' ' + event.summary).toLowerCase();
  let score = 0.3; // baseline narrative presence

  // Amplification language
  const ampHits = AMPLIFICATION_KEYWORDS.filter(k => text.includes(k)).length;
  score += ampHits * 0.12;

  // Emotional language
  const emoHits = EMOTIONAL_KEYWORDS.filter(k => text.includes(k)).length;
  score += emoHits * 0.08;

  // Geopolitical events carry higher narrative load inherently
  if (event.category === 'geopolitical') score += 0.10;

  // Low confidence + high severity = narrative likely ahead of facts
  if (event.confidenceTier <= 1 && event.status === 'pending') score += 0.12;

  // Contradicted events often have heavy narrative surrounding them
  if (event.status === 'contradicted') score += 0.10;

  return Math.max(0, Math.min(1, score));
}

// ── Volatility scoring ───────────────────────────────────────

function scoreVolatility(event: EpiconItem): number {
  let score = 0.25; // baseline

  // Market events with price data carry direct volatility
  if (event.category === 'market') score += 0.20;

  // Infrastructure events (earthquakes, system failures) spike volatility
  if (event.category === 'infrastructure') score += 0.15;

  // Geopolitical escalation drives cross-asset volatility
  if (event.category === 'geopolitical') score += 0.18;

  // High severity events create system-wide reaction
  if (event.trace.length >= 4) score += 0.10;
  if (event.trace.length >= 3) score += 0.05;

  // Pending status means the system is actively processing — volatility in motion
  if (event.status === 'pending') score += 0.08;

  // Contradicted events whipsaw markets
  if (event.status === 'contradicted') score += 0.12;

  return Math.max(0, Math.min(1, score));
}

// ── Classification ───────────────────────────────────────────

function classify(signal: number, narrative: number): SignalClassification {
  const divergence = narrative - signal;

  // Strong signal, narrative proportional or below
  if (signal >= 0.7 && divergence < 0.15) return 'SIGNAL';

  // Narrative significantly ahead of verification
  if (divergence > 0.25 || (narrative > 0.7 && signal < 0.5)) return 'DISTORTION';

  // Everything else: real event with elevated narrative
  return 'EMERGING';
}

// ── Summary generation ───────────────────────────────────────

function generateSummary(
  classification: SignalClassification,
  signal: number,
  narrative: number,
  category: EpiconItem['category'],
): string {
  switch (classification) {
    case 'SIGNAL':
      return `Verified ${category} event. Signal strength ${(signal * 100).toFixed(0)}%. Narrative proportional to facts.`;
    case 'EMERGING':
      return `Active ${category} signal with elevated narrative amplification. Monitor for divergence.`;
    case 'DISTORTION':
      return `Narrative (${(narrative * 100).toFixed(0)}%) exceeds verification (${(signal * 100).toFixed(0)}%). High distortion risk.`;
  }
}

// ── Public API ───────────────────────────────────────────────

export function scoreEvent(event: EpiconItem): SignalScore {
  const signal = scoreSignal(event);
  const narrative = scoreNarrative(event);
  const volatility = scoreVolatility(event);
  const classification = classify(signal, narrative);
  const divergence = Number((narrative - signal).toFixed(3));
  const summary = generateSummary(classification, signal, narrative, event.category);

  return {
    eventId: event.id,
    title: event.title,
    category: event.category,
    signal,
    narrative,
    volatility,
    classification,
    divergence,
    summary,
  };
}

export function scoreBatch(events: EpiconItem[]): SignalScore[] {
  return events.map(scoreEvent);
}

/**
 * Aggregate signal health across a batch of events.
 * Returns the overall signal-vs-narrative balance for the cycle.
 */
export function cycleSignalHealth(scores: SignalScore[]): {
  avgSignal: number;
  avgNarrative: number;
  avgVolatility: number;
  distortionCount: number;
  signalCount: number;
  emergingCount: number;
  healthLabel: string;
} {
  if (scores.length === 0) {
    return {
      avgSignal: 0, avgNarrative: 0, avgVolatility: 0,
      distortionCount: 0, signalCount: 0, emergingCount: 0,
      healthLabel: 'No data',
    };
  }

  const avgSignal = scores.reduce((s, e) => s + e.signal, 0) / scores.length;
  const avgNarrative = scores.reduce((s, e) => s + e.narrative, 0) / scores.length;
  const avgVolatility = scores.reduce((s, e) => s + e.volatility, 0) / scores.length;
  const distortionCount = scores.filter(s => s.classification === 'DISTORTION').length;
  const signalCount = scores.filter(s => s.classification === 'SIGNAL').length;
  const emergingCount = scores.filter(s => s.classification === 'EMERGING').length;

  let healthLabel: string;
  if (distortionCount === 0 && avgSignal > 0.7) healthLabel = 'High clarity';
  else if (distortionCount <= 1 && avgSignal > 0.5) healthLabel = 'Moderate clarity';
  else if (avgNarrative > avgSignal + 0.2) healthLabel = 'Narrative-heavy';
  else healthLabel = 'Low clarity';

  return { avgSignal, avgNarrative, avgVolatility, distortionCount, signalCount, emergingCount, healthLabel };
}
