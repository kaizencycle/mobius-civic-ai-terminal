// ============================================================================
// Mobius Micro Sub-Agent Orchestrator — Sensor Federation (40 instruments)
// ============================================================================

export { type MicroSignal, type AgentPollResult, type MicroAgentConfig } from './core';
export { pollGaia, GAIA_CONFIG } from './gaia';
export { pollHermes, HERMES_CONFIG } from './hermes';
export { pollThemis, THEMIS_CONFIG } from './themis';
export { pollDaedalus, DAEDALUS_CONFIG } from './daedalus';
export { ALL_INSTRUMENT_POLLS } from './instrument-polls';

import { type AgentPollResult, type MicroSignal } from './core';
import { ALL_INSTRUMENT_POLLS } from './instrument-polls';

function computeHermesU34Gi(agent: AgentPollResult): number | null {
  if (!agent.healthy || agent.errors.length > 0) {
    return null;
  }
  if (agent.signals.length === 0) {
    return null;
  }
  const s = agent.signals[0]!;
  const raw = s.raw as { httpOk?: boolean; quietContext?: boolean; structuralEmpty?: boolean } | undefined;
  if (raw && raw.httpOk === false && s.value === 0) {
    return null;
  }
  if (raw && raw.structuralEmpty === true && s.value === 0) {
    return null;
  }
  return Number(
    (agent.signals.reduce((sum, signal) => sum + signal.value, 0) / agent.signals.length).toFixed(3),
  );
}

export interface MicroAgentSweepResult {
  timestamp: string;
  agents: AgentPollResult[];
  allSignals: MicroSignal[];
  composite: number;
  /** Agents that contributed a numeric slice to `composite` (C-314: excludes failed / empty polls). */
  compositeContributorCount: number;
  anomalies: MicroSignal[];
  healthy: boolean;
  instrumentCount: number;
}

const CONCURRENCY = 20;

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

export async function pollAllMicroAgents(): Promise<MicroAgentSweepResult> {
  const results = await mapLimit(ALL_INSTRUMENT_POLLS, CONCURRENCY, (poll) => poll());

  const agents: AgentPollResult[] = results;

  const allSignals = agents.flatMap((a) => a.signals);

  const compositeParts: number[] = [];
  for (const agent of agents) {
    const isHermesU34 = agent.agentName.startsWith('HERMES-µ3') || agent.agentName.startsWith('HERMES-µ4');
    if (isHermesU34) {
      const h = computeHermesU34Gi(agent);
      if (h !== null) {
        compositeParts.push(h);
      }
      continue;
    }
    // C-314 FIX-7: do not average in "0" scores from failed / unhealthy polls — exclude them.
    if (!agent.healthy || agent.errors.length > 0) {
      continue;
    }
    if (agent.signals.length === 0) {
      compositeParts.push(0.5);
      continue;
    }
    compositeParts.push(
      Number((agent.signals.reduce((sum, signal) => sum + signal.value, 0) / agent.signals.length).toFixed(3)),
    );
  }

  const composite =
    compositeParts.length > 0
      ? Number((compositeParts.reduce((sum, value) => sum + value, 0) / compositeParts.length).toFixed(3))
      : 0.75;

  const anomalies = allSignals.filter((s) => s.severity === 'elevated' || s.severity === 'critical');

  return {
    timestamp: new Date().toISOString(),
    agents,
    allSignals,
    composite,
    compositeContributorCount: compositeParts.length,
    anomalies,
    healthy: agents.some((a) => a.healthy),
    instrumentCount: ALL_INSTRUMENT_POLLS.length,
  };
}
