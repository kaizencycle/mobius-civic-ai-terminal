// ============================================================================
// Mobius Micro Sub-Agent Orchestrator — Sensor Federation (40 instruments)
//
// Polls 8 parent families × 5 public API instruments (see instrument-polls.ts).
// Legacy exports kept for tests and direct imports.
// CC0 Public Domain
// ============================================================================

export { type MicroSignal, type AgentPollResult, type MicroAgentConfig } from './core';
export { pollGaia, GAIA_CONFIG } from './gaia';
export { pollHermes, HERMES_CONFIG } from './hermes';
export { pollThemis, THEMIS_CONFIG } from './themis';
export { pollDaedalus, DAEDALUS_CONFIG } from './daedalus';
export { ALL_INSTRUMENT_POLLS } from './instrument-polls';

import { type AgentPollResult, type MicroSignal } from './core';
import { pollGaia } from './gaia';
import { pollHermes } from './hermes';
import { pollThemis } from './themis';
import { pollDaedalus } from './daedalus';
import { ALL_INSTRUMENT_POLLS } from './instrument-polls';

export interface MicroAgentSweepResult {
  timestamp: string;
  agents: AgentPollResult[];
  allSignals: MicroSignal[];
  composite: number; // 0–1 aggregate health
  anomalies: MicroSignal[];
  healthy: boolean;
  /** Total micro-instruments configured (8 families × 5). */
  instrumentCount: number;
}

const CONCURRENCY = 8;

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let idx = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = idx++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]!);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return out;
}

/**
 * Run a full sweep of all 40 micro-instruments (public APIs).
 */
export async function pollAllMicroAgents(): Promise<MicroAgentSweepResult> {
  const results = await mapLimit(ALL_INSTRUMENT_POLLS, CONCURRENCY, (poll) => poll());

  const agents: AgentPollResult[] = results;
  const allSignals = agents.flatMap((a) => a.signals);

  const compositeByAgent = agents.map((agent) => {
    if (agent.signals.length === 0) return 0.5;
    return Number((agent.signals.reduce((sum, signal) => sum + signal.value, 0) / agent.signals.length).toFixed(3));
  });

  const composite =
    compositeByAgent.length > 0
      ? Number((compositeByAgent.reduce((sum, value) => sum + value, 0) / compositeByAgent.length).toFixed(3))
      : 0.5;

  const anomalies = allSignals.filter((s) => s.severity === 'elevated' || s.severity === 'critical');

  return {
    timestamp: new Date().toISOString(),
    agents,
    allSignals,
    composite,
    anomalies,
    healthy: agents.some((a) => a.healthy),
    instrumentCount: ALL_INSTRUMENT_POLLS.length,
  };
}

/**
 * Legacy: original 4-agent sweep (GAIA, HERMES-µ, THEMIS, DAEDALUS-µ).
 * Prefer `pollAllMicroAgents` in production.
 */
export async function pollLegacyFourMicroAgents(): Promise<MicroAgentSweepResult> {
  const results = await Promise.allSettled([pollGaia(), pollHermes(), pollThemis(), pollDaedalus()]);

  const agents: AgentPollResult[] = results
    .filter((r): r is PromiseFulfilledResult<AgentPollResult> => r.status === 'fulfilled')
    .map((r) => r.value);

  const allSignals = agents.flatMap((a) => a.signals);

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

  const composite =
    compositeByAgent.length > 0
      ? Number((compositeByAgent.reduce((sum, value) => sum + value, 0) / compositeByAgent.length).toFixed(3))
      : 0.5;

  const anomalies = allSignals.filter((s) => s.severity === 'elevated' || s.severity === 'critical');

  return {
    timestamp: new Date().toISOString(),
    agents,
    allSignals,
    composite,
    anomalies,
    healthy: agents.some((a) => a.healthy),
    instrumentCount: 4,
  };
}
