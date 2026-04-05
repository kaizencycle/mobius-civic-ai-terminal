// ============================================================================
// Mobius Micro Sub-Agent Orchestrator
//
// Polls all four micro-agents and aggregates results.
// CC0 Public Domain
// ============================================================================

export { type MicroSignal, type AgentPollResult, type MicroAgentConfig } from './core';
export { pollGaia, GAIA_CONFIG } from './gaia';
export { pollHermes, HERMES_CONFIG } from './hermes';
export { pollThemis, THEMIS_CONFIG } from './themis';
export { pollDaedalus, DAEDALUS_CONFIG } from './daedalus';

import { type AgentPollResult, type MicroSignal } from './core';
import { pollGaia } from './gaia';
import { pollHermes } from './hermes';
import { pollThemis } from './themis';
import { pollDaedalus } from './daedalus';

export interface MicroAgentSweepResult {
  timestamp: string;
  agents: AgentPollResult[];
  allSignals: MicroSignal[];
  composite: number;       // 0–1 aggregate health
  anomalies: MicroSignal[];
  healthy: boolean;
}

/**
 * Run a full sweep of all micro sub-agents.
 * Returns aggregated signals, a composite health score, and any anomalies.
 */
export async function pollAllMicroAgents(): Promise<MicroAgentSweepResult> {
  const results = await Promise.allSettled([
    pollGaia(),
    pollHermes(),
    pollThemis(),
    pollDaedalus(),
  ]);

  const agents: AgentPollResult[] = results
    .filter((r): r is PromiseFulfilledResult<AgentPollResult> => r.status === 'fulfilled')
    .map((r) => r.value);

  const allSignals = agents.flatMap((a) => a.signals);

  // Composite: average by agent, with GAIA source-aware weighting.
  const compositeByAgent = agents.map((agent) => {
    if (agent.signals.length === 0) return 0.5;

    if (agent.agentName === 'GAIA') {
      const weather = agent.signals.find((signal) => signal.source === 'Open-Meteo')?.value;
      const quakes = agent.signals.find((signal) => signal.source === 'USGS Earthquake')?.value;
      const eonet = agent.signals.find((signal) => signal.source === 'NASA EONET')?.value;

      const weights = [
        { value: quakes, weight: 0.4 },
        { value: weather, weight: 0.3 },
        { value: eonet, weight: 0.3 },
      ].filter((entry): entry is { value: number; weight: number } => typeof entry.value === 'number');

      if (weights.length > 0) {
        const weightedTotal = weights.reduce((sum, entry) => sum + entry.value * entry.weight, 0);
        const totalWeight = weights.reduce((sum, entry) => sum + entry.weight, 0);
        return Number((weightedTotal / totalWeight).toFixed(3));
      }
    }

    return Number((agent.signals.reduce((sum, signal) => sum + signal.value, 0) / agent.signals.length).toFixed(3));
  });

  const composite = compositeByAgent.length > 0
    ? Number((compositeByAgent.reduce((sum, value) => sum + value, 0) / compositeByAgent.length).toFixed(3))
    : 0.5;

  // Anomalies: anything elevated or critical
  const anomalies = allSignals.filter((s) => s.severity === 'elevated' || s.severity === 'critical');

  return {
    timestamp: new Date().toISOString(),
    agents,
    allSignals,
    composite,
    anomalies,
    healthy: agents.some((a) => a.healthy),
  };
}
