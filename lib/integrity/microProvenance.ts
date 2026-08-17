/**
 * C-406 — refresh micro GI provenance when serving cached sweep data.
 */

import { getGiMode } from '@/lib/gi/mode';
import { buildGiRepresentation } from '@/lib/integrity/giProvenance';
import {
  deriveOperationalDecisionState,
  type OperationalClassification,
  type OperationalDecisionState,
} from '@/lib/integrity/operationalState';

type MicroCachePayload = {
  gi: number;
  timestamp: string;
  instrumentCount: number;
  fallbacksUsed: number;
  errors: number;
  agents: { healthy: boolean }[];
  allSignals: { severity: string }[];
  failedInstruments?: { id: string; agent: string; error: string }[];
  gi_representation?: ReturnType<typeof buildGiRepresentation>;
  decision_state?: {
    display_state: ReturnType<typeof getGiMode>;
    operational_classification: string;
    tripwire_state: string;
    mutation_state: 'forbidden';
    decision_summary: string;
  };
  healthy: boolean;
  cached: boolean;
  composite: number;
  [key: string]: unknown;
};

function applyMicroInstrumentStress(
  decision: OperationalDecisionState,
  args: { failedCount: number; degradedInstrumentCount: number },
): OperationalDecisionState {
  if (decision.operational_classification === 'CRITICAL') {
    return decision;
  }
  if (args.failedCount <= 0 && args.degradedInstrumentCount <= 0) {
    return decision;
  }

  const operational_classification: OperationalClassification = 'STRESSED';
  return {
    ...decision,
    operational_classification,
    decision_summary: `${decision.decision_summary}; ${args.failedCount} failed / ${args.degradedInstrumentCount} non-nominal instruments`,
  };
}

function toMicroDecisionView(
  decision: OperationalDecisionState,
  suffix: string,
): NonNullable<MicroCachePayload['decision_state']> {
  return {
    display_state: decision.display_state,
    operational_classification: decision.operational_classification,
    tripwire_state: 'unknown',
    mutation_state: 'forbidden',
    decision_summary: `${decision.decision_summary}; ${suffix}`,
  };
}

export function refreshMicroCachedProvenance(
  data: MicroCachePayload,
  cachedAt: number,
): MicroCachePayload {
  const cacheAgeSeconds = Math.max(0, Math.floor((Date.now() - cachedAt) / 1000));
  const degradedAgentCount = data.agents.filter((agent) => !agent.healthy).length;
  const degradedInstrumentCount = data.allSignals.filter((s) => s.severity !== 'nominal').length;
  const failedCount = data.failedInstruments?.length ?? data.errors;

  const gi_representation = buildGiRepresentation({
    value: data.gi,
    computation_source: 'live-compute',
    persistence_source: 'cached',
    computed_at: data.timestamp,
    persisted_at: new Date(cachedAt).toISOString(),
    cache_age_seconds: cacheAgeSeconds,
    degraded: cacheAgeSeconds > 60,
    stored_mode: null,
    derived_mode: getGiMode(data.gi),
    instrument_count: data.instrumentCount,
    degraded_instrument_count: degradedInstrumentCount,
    failed_instrument_count: failedCount,
    fallback_usage_count: data.fallbacksUsed,
    sample_window: 'signals:micro:registry:40',
  });

  const baseDecision = deriveOperationalDecisionState({
    gi: data.gi,
    tripwire_active: false,
    kv_continuity_ok: null,
    degraded_agent_count: degradedAgentCount,
    gi_degraded: cacheAgeSeconds > 60,
    governance_state: 'unknown',
    mutation_state: 'forbidden',
  });
  const decision_state = applyMicroInstrumentStress(baseDecision, {
    failedCount,
    degradedInstrumentCount,
  });

  return {
    ...data,
    cached: true,
    gi_representation,
    decision_state: toMicroDecisionView(decision_state, `micro cache age ${cacheAgeSeconds}s`),
  };
}

export function buildMicroLiveProvenance(args: {
  gi: number;
  instruments: { source: string }[];
  agents: { healthy: boolean }[];
  allSignals: { severity: string }[];
  failedInstruments: { id: string }[];
  generatedAtIso: string;
  instrumentCount: number;
  fallbacksUsed: number;
}): {
  gi_representation: ReturnType<typeof buildGiRepresentation>;
  decision_state: MicroCachePayload['decision_state'];
} {
  const degradedInstrumentCount = args.allSignals.filter((s) => s.severity !== 'nominal').length;
  const failedCount = args.failedInstruments.length;
  const degradedAgentCount = args.agents.filter((a) => !a.healthy).length;

  const gi_representation = buildGiRepresentation({
    value: args.gi,
    computation_source: 'live-compute',
    persistence_source: 'live',
    computed_at: args.generatedAtIso,
    persisted_at: null,
    cache_age_seconds: 0,
    degraded: false,
    stored_mode: null,
    derived_mode: getGiMode(args.gi),
    instrument_count: args.instrumentCount,
    degraded_instrument_count: degradedInstrumentCount,
    failed_instrument_count: failedCount,
    fallback_usage_count: args.fallbacksUsed,
    sample_window: 'signals:micro:registry:40',
  });

  const baseDecision = deriveOperationalDecisionState({
    gi: args.gi,
    tripwire_active: false,
    kv_continuity_ok: null,
    degraded_agent_count: degradedAgentCount,
    gi_degraded: false,
    governance_state: 'unknown',
    mutation_state: 'forbidden',
  });
  const decision_state = applyMicroInstrumentStress(baseDecision, {
    failedCount,
    degradedInstrumentCount,
  });

  return {
    gi_representation,
    decision_state: toMicroDecisionView(decision_state, 'live micro sweep'),
  };
}
