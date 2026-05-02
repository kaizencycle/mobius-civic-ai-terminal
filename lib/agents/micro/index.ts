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
import { pollGaia } from './gaia';
import { pollHermes } from './hermes';
import { pollThemis } from './themis';
import { pollDaedalus } from './daedalus';
import { ALL_INSTRUMENT_POLLS } from './instrument-polls';

function normalizeHermesFallback(signal: MicroSignal | undefined, agentName: string): MicroSignal {
  if (!signal || signal.value === 0) {
    return {
      agentName,
      source: 'fallback · narrative neutral',
      timestamp: new Date().toISOString(),
      value: 0.5,
      label: `${agentName}: fallback neutral (no live signal)`,
      severity: 'nominal',
      raw: { fallback: true },
    };
  }
  return signal;
}

export interface MicroAgentSweepResult {
  timestamp: string;
  agents: AgentPollResult[];
  allSignals: MicroSignal[];
  composite: number;
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

  const agents: AgentPollResult[] = results.map((agent) => {
    if (agent.agentName.startsWith('HERMES-µ3') || agent.agentName.startsWith('HERMES-µ4')) {
      return {
        ...agent,
        signals: [normalizeHermesFallback(agent.signals[0], agent.agentName)],
      };
    }
    return agent;
  });

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
