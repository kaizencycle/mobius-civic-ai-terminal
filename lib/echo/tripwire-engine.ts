/**
 * Tripwire Detection Engine
 *
 * 10 auto-detectors across 6 layers that analyze EPICON data, GI snapshots,
 * and agent state to surface structural anomalies automatically.
 *
 * Layers:
 *   1. Information  — narrative distortion, source credibility
 *   2. Market       — volatility spikes, cross-asset contagion
 *   3. Infrastructure — supply chain, energy, logistics
 *   4. Governance   — institutional trust decay, policy divergence
 *   5. Cognitive    — amplification patterns, echo chamber detection
 *   6. System       — agent drift, integrity degradation
 */

import type { EpiconItem, GISnapshot, Agent, Tripwire } from '@/lib/terminal/types';

// ── Detection context ─────────────────────────────────────────

export type DetectionContext = {
  epicon: EpiconItem[];
  gi: GISnapshot;
  agents: Agent[];
  tripwires: Tripwire[];
};

// ── Individual detectors ──────────────────────────────────────

/** 1. Narrative Velocity — information layer */
function detectNarrativeVelocity(ctx: DetectionContext): Tripwire | null {
  const recent = ctx.epicon.filter((e) => e.status === 'pending');
  const threshold = 5;
  if (recent.length < threshold) return null;

  // Check if multiple pending items share similar categories (narrative clustering)
  const catCounts: Record<string, number> = {};
  for (const e of recent) {
    catCounts[e.category] = (catCounts[e.category] || 0) + 1;
  }
  const maxCluster = Math.max(...Object.values(catCounts));
  if (maxCluster < 3) return null;

  return {
    id: `TW-AUTO-NV-${Date.now().toString(36).slice(-4).toUpperCase()}`,
    label: 'Narrative Velocity Spike',
    severity: maxCluster >= 5 ? 'high' : 'medium',
    owner: 'ZEUS',
    openedAt: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET',
    action: `${recent.length} pending EPICONs detected with ${maxCluster} clustering in single category — possible coordinated narrative`,
    layer: 'information',
    category: 'narrative-distortion',
    autoDetected: true,
    triggerMetric: 'pending_epicon_cluster',
    triggerThreshold: threshold,
    triggerValue: maxCluster,
  };
}

/** 2. Source Credibility Gap — information layer */
function detectSourceCredibilityGap(ctx: DetectionContext): Tripwire | null {
  const lowConf = ctx.epicon.filter((e) => e.confidenceTier <= 1);
  const threshold = 0.4;
  const ratio = ctx.epicon.length > 0 ? lowConf.length / ctx.epicon.length : 0;
  if (ratio < threshold) return null;

  return {
    id: `TW-AUTO-SC-${Date.now().toString(36).slice(-4).toUpperCase()}`,
    label: 'Source Credibility Degradation',
    severity: ratio >= 0.6 ? 'high' : 'medium',
    owner: 'ZEUS',
    openedAt: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET',
    action: `${(ratio * 100).toFixed(0)}% of EPICONs at T0-T1 confidence — information quality below threshold`,
    layer: 'information',
    category: 'source-credibility',
    autoDetected: true,
    triggerMetric: 'low_confidence_ratio',
    triggerThreshold: threshold,
    triggerValue: parseFloat(ratio.toFixed(3)),
  };
}

/** 3. Market Volatility Spike — market layer */
function detectMarketVolatility(ctx: DetectionContext): Tripwire | null {
  const marketPending = ctx.epicon.filter((e) => e.category === 'market' && e.status === 'pending');
  const threshold = 3;
  if (marketPending.length < threshold) return null;

  return {
    id: `TW-AUTO-MV-${Date.now().toString(36).slice(-4).toUpperCase()}`,
    label: 'Market Signal Cluster',
    severity: marketPending.length >= 5 ? 'high' : 'medium',
    owner: 'HERMES',
    openedAt: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET',
    action: `${marketPending.length} unverified market signals — cross-asset contagion risk elevated`,
    layer: 'market',
    category: 'volatility-spike',
    autoDetected: true,
    triggerMetric: 'market_pending_count',
    triggerThreshold: threshold,
    triggerValue: marketPending.length,
  };
}

/** 4. Cross-Asset Contagion — market layer */
function detectCrossAssetContagion(ctx: DetectionContext): Tripwire | null {
  // Fires when GI weekly trend shows 3+ consecutive drops
  const weekly = ctx.gi.weekly;
  if (weekly.length < 3) return null;

  let consecutiveDrops = 0;
  for (let i = 1; i < weekly.length; i++) {
    if (weekly[i] < weekly[i - 1]) consecutiveDrops++;
    else consecutiveDrops = 0;
  }

  const threshold = 3;
  if (consecutiveDrops < threshold) return null;

  return {
    id: `TW-AUTO-CA-${Date.now().toString(36).slice(-4).toUpperCase()}`,
    label: 'GI Trend Deterioration',
    severity: consecutiveDrops >= 5 ? 'high' : 'medium',
    owner: 'ATLAS',
    openedAt: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET',
    action: `${consecutiveDrops} consecutive GI drops detected — systemic integrity trend declining`,
    layer: 'market',
    category: 'cross-asset-contagion',
    autoDetected: true,
    triggerMetric: 'gi_consecutive_drops',
    triggerThreshold: threshold,
    triggerValue: consecutiveDrops,
  };
}

/** 5. Supply Chain Stress — infrastructure layer */
function detectSupplyChainStress(ctx: DetectionContext): Tripwire | null {
  const infraItems = ctx.epicon.filter((e) => e.category === 'infrastructure');
  const highSev = infraItems.filter((e) => e.confidenceTier >= 3);
  const threshold = 2;
  if (highSev.length < threshold) return null;

  return {
    id: `TW-AUTO-SCS-${Date.now().toString(36).slice(-4).toUpperCase()}`,
    label: 'Infrastructure Stress Signal',
    severity: highSev.length >= 4 ? 'high' : 'medium',
    owner: 'ATLAS',
    openedAt: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET',
    action: `${highSev.length} high-confidence infrastructure EPICONs — supply chain disruption risk`,
    layer: 'infrastructure',
    category: 'supply-chain',
    autoDetected: true,
    triggerMetric: 'infra_high_confidence_count',
    triggerThreshold: threshold,
    triggerValue: highSev.length,
  };
}

/** 6. Institutional Trust Decay — governance layer */
function detectTrustDecay(ctx: DetectionContext): Tripwire | null {
  const threshold = 0.80;
  if (ctx.gi.institutionalTrust >= threshold) return null;

  return {
    id: `TW-AUTO-TD-${Date.now().toString(36).slice(-4).toUpperCase()}`,
    label: 'Institutional Trust Below Threshold',
    severity: ctx.gi.institutionalTrust < 0.70 ? 'high' : 'medium',
    owner: 'ATLAS',
    openedAt: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET',
    action: `Trust index at ${(ctx.gi.institutionalTrust * 100).toFixed(1)}% — governance layer degraded`,
    layer: 'governance',
    category: 'institutional-trust',
    autoDetected: true,
    triggerMetric: 'institutional_trust',
    triggerThreshold: threshold,
    triggerValue: ctx.gi.institutionalTrust,
  };
}

/** 7. Contradiction Surge — cognitive layer */
function detectContradictionSurge(ctx: DetectionContext): Tripwire | null {
  const contradicted = ctx.epicon.filter((e) => e.status === 'contradicted');
  const threshold = 3;
  if (contradicted.length < threshold) return null;

  return {
    id: `TW-AUTO-CS-${Date.now().toString(36).slice(-4).toUpperCase()}`,
    label: 'Contradiction Surge',
    severity: contradicted.length >= 5 ? 'high' : 'medium',
    owner: 'ZEUS',
    openedAt: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET',
    action: `${contradicted.length} EPICONs contradicted — possible coordinated disinformation or fast-moving ground truth`,
    layer: 'cognitive',
    category: 'echo-chamber',
    autoDetected: true,
    triggerMetric: 'contradicted_count',
    triggerThreshold: threshold,
    triggerValue: contradicted.length,
  };
}

/** 8. Amplification Pattern — cognitive layer */
function detectAmplificationPattern(ctx: DetectionContext): Tripwire | null {
  // Detect when the same title keywords appear across multiple EPICONs
  const titleWords: Record<string, number> = {};
  for (const e of ctx.epicon) {
    const words = e.title.toLowerCase().split(/\s+/).filter((w) => w.length > 4);
    const seen = new Set<string>();
    for (const w of words) {
      if (!seen.has(w)) {
        titleWords[w] = (titleWords[w] || 0) + 1;
        seen.add(w);
      }
    }
  }

  const amplified = Object.entries(titleWords).filter(([, c]) => c >= 4);
  if (amplified.length === 0) return null;

  const topWord = amplified.sort((a, b) => b[1] - a[1])[0];

  return {
    id: `TW-AUTO-AP-${Date.now().toString(36).slice(-4).toUpperCase()}`,
    label: 'Narrative Amplification Detected',
    severity: topWord[1] >= 6 ? 'high' : 'medium',
    owner: 'ZEUS',
    openedAt: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET',
    action: `"${topWord[0]}" appears in ${topWord[1]} EPICONs — amplification or echo chamber pattern`,
    layer: 'cognitive',
    category: 'amplification',
    autoDetected: true,
    triggerMetric: 'keyword_frequency',
    triggerThreshold: 4,
    triggerValue: topWord[1],
  };
}

/** 9. Agent Drift — system layer */
function detectAgentDrift(ctx: DetectionContext): Tripwire | null {
  const unhealthy = ctx.agents.filter((a) => !a.heartbeatOk || a.status === 'alert');
  const threshold = 2;
  if (unhealthy.length < threshold) return null;

  return {
    id: `TW-AUTO-AD-${Date.now().toString(36).slice(-4).toUpperCase()}`,
    label: 'Agent Health Degradation',
    severity: unhealthy.length >= 3 ? 'high' : 'medium',
    owner: 'ECHO',
    openedAt: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET',
    action: `${unhealthy.length} agents reporting unhealthy — ${unhealthy.map((a) => a.name).join(', ')}`,
    layer: 'system',
    category: 'agent-drift',
    autoDetected: true,
    triggerMetric: 'unhealthy_agent_count',
    triggerThreshold: threshold,
    triggerValue: unhealthy.length,
  };
}

/** 10. GI Integrity Drop — system layer */
function detectGIDrop(ctx: DetectionContext): Tripwire | null {
  const threshold = -0.08;
  if (ctx.gi.delta >= threshold) return null;

  return {
    id: `TW-AUTO-GID-${Date.now().toString(36).slice(-4).toUpperCase()}`,
    label: 'GI Acute Drop',
    severity: ctx.gi.delta <= -0.15 ? 'high' : 'medium',
    owner: 'ATLAS',
    openedAt: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET',
    action: `GI delta ${(ctx.gi.delta * 100).toFixed(1)}% — acute integrity degradation this cycle`,
    layer: 'system',
    category: 'integrity-drop',
    autoDetected: true,
    triggerMetric: 'gi_delta',
    triggerThreshold: threshold,
    triggerValue: ctx.gi.delta,
  };
}

// ── Detection registry ────────────────────────────────────────

const DETECTORS: Array<(ctx: DetectionContext) => Tripwire | null> = [
  detectNarrativeVelocity,
  detectSourceCredibilityGap,
  detectMarketVolatility,
  detectCrossAssetContagion,
  detectSupplyChainStress,
  detectTrustDecay,
  detectContradictionSurge,
  detectAmplificationPattern,
  detectAgentDrift,
  detectGIDrop,
];

// ── Public API ────────────────────────────────────────────────

/**
 * Run all detectors against the current terminal state.
 * Returns only the tripwires that fired (non-null results).
 */
export function detectTripwires(ctx: DetectionContext): Tripwire[] {
  return DETECTORS.map((d) => d(ctx)).filter((t): t is Tripwire => t !== null);
}

/**
 * Merge auto-detected tripwires with manual/existing tripwires.
 * Deduplicates by category — keeps the most recent auto-detected one per category.
 */
export function mergeTripwires(manual: Tripwire[], auto: Tripwire[]): Tripwire[] {
  const seenCategories = new Set<string>();
  const deduped: Tripwire[] = [];

  // Auto-detected first (newest)
  for (const t of auto) {
    const cat = t.category ?? t.id;
    if (!seenCategories.has(cat)) {
      seenCategories.add(cat);
      deduped.push(t);
    }
  }

  // Then manual tripwires (always included)
  return [...manual, ...deduped];
}
