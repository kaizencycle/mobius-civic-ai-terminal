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

  // Composite: weighted average of all signal values
  const composite = allSignals.length > 0
    ? Number((allSignals.reduce((sum, s) => sum + s.value, 0) / allSignals.length).toFixed(3))
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
