/**
 * C-406 — build gi_representation + decision_state from final resolved GI.
 */

import type { GIMode } from '@/lib/gi/mode';
import { getGiMode } from '@/lib/gi/mode';
import type { GiChainResolution } from '@/lib/gi/resolveGiChain';
import type { IntegrityPayload } from '@/lib/integrity/buildStatus';
import { buildGiRepresentation, resolvePersistedAtForSource } from '@/lib/integrity/giProvenance';
import {
  deriveOperationalDecisionState,
  type OperationalDecisionState,
} from '@/lib/integrity/operationalState';
import type { GiRepresentation } from '@/lib/integrity/giProvenance';
import type { KvKeyHealthReport } from '@/lib/kv/kvKeyHealth';
import type { RuntimeTripwireState } from '@/lib/tripwire/store';

export type IntegrityEnrichment = {
  global_integrity: number;
  mode: GIMode;
  terminal_status: 'nominal' | 'stressed' | 'critical';
  gi_provenance: string;
  gi_representation: GiRepresentation;
  decision_state: OperationalDecisionState;
  kv_continuity_ok: boolean | null;
  gi_degraded: boolean;
  gi_age_seconds: number | null;
  source: string;
};

export function buildIntegrityEnrichment(args: {
  finalGi: number;
  computationSource: string;
  persistenceSource: string;
  chain: GiChainResolution;
  payload: IntegrityPayload;
  kvKeyHealth: KvKeyHealthReport | null;
  tripwire: RuntimeTripwireState;
  degradedAgentCount: number | null;
  giDegraded: boolean;
  storedMode: GIMode | null;
  remoteMode?: GIMode | null;
}): IntegrityEnrichment {
  const derivedMode = getGiMode(args.finalGi);
  const mode = args.remoteMode ?? derivedMode;
  const terminal_status =
    mode === 'green' ? 'nominal' : mode === 'yellow' ? 'stressed' : 'critical';

  const persistedAt = resolvePersistedAtForSource({
    computation_source: args.computationSource,
    persisted_timestamp: args.chain.timestamp ?? args.payload.timestamp,
    kv_available: Boolean(args.payload.kv),
  });

  const gi_representation = buildGiRepresentation({
    value: args.finalGi,
    computation_source: args.computationSource,
    persistence_source: args.persistenceSource,
    computed_at: new Date().toISOString(),
    persisted_at: persistedAt,
    cache_age_seconds: args.chain.age_seconds,
    degraded: args.giDegraded,
    stored_mode: args.storedMode,
    derived_mode: derivedMode,
  });

  const degradedAgents = args.degradedAgentCount;
  const decision_state = deriveOperationalDecisionState({
    gi: args.finalGi,
    stored_mode: args.storedMode,
    tripwire_active: args.tripwire.active,
    tripwire_level: args.tripwire.level,
    kv_continuity_ok: args.kvKeyHealth?.kv_continuity_ok ?? null,
    degraded_agent_count: degradedAgents,
    gi_degraded: args.giDegraded,
    governance_state: 'unknown',
    mutation_state: 'forbidden',
  });

  return {
    global_integrity: args.finalGi,
    mode,
    terminal_status,
    gi_provenance: args.computationSource,
    gi_representation,
    decision_state,
    kv_continuity_ok: args.kvKeyHealth?.kv_continuity_ok ?? null,
    gi_degraded: args.giDegraded,
    gi_age_seconds: args.chain.age_seconds,
    source: args.persistenceSource,
  };
}
