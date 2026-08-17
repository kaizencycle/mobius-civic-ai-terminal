/**
 * C-406 — operational decision state (display vs authority vs governance).
 *
 * Separates numeric GI band presentation from operational classification,
 * tripwire, persistence health, and mutation authority.
 */

import { getGiMode, type GIMode } from '@/lib/gi/mode';
import { GI_BANDS } from '@/lib/gi/bands';
import { SUSTAIN_GI_THRESHOLD } from '@/lib/mic/sustainTracker';

export type OperationalClassification = 'NOMINAL' | 'STRESSED' | 'CRITICAL';
export type TripwireStateLabel = 'clear' | 'watch' | 'elevated' | 'unknown';
export type PersistenceStateLabel = 'healthy' | 'degraded' | 'unknown';
export type GovernanceStateLabel = 'clear' | 'disputed' | 'pending' | 'unknown';
export type MutationStateLabel = 'forbidden' | 'authorized';

export type OperationalDecisionState = {
  /** Band-derived GI presentation (green/yellow/red). */
  display_state: GIMode;
  /** Composite operational posture — may diverge from display_state. */
  operational_classification: OperationalClassification;
  /** Terminal status derived from display band (not stored KV copy). */
  terminal_status: 'nominal' | 'stressed' | 'critical';
  tripwire_state: TripwireStateLabel;
  persistence_state: PersistenceStateLabel;
  sustain_eligible: boolean;
  governance_state: GovernanceStateLabel;
  mutation_state: MutationStateLabel;
  /** Human-readable summary for operators — fail-closed. */
  decision_summary: string;
};

function terminalStatusFromMode(mode: GIMode): OperationalDecisionState['terminal_status'] {
  if (mode === 'green') return 'nominal';
  if (mode === 'yellow') return 'stressed';
  return 'critical';
}

function normalizeTripwireLevel(
  level: string | undefined,
  active: boolean,
): TripwireStateLabel {
  if (!active) return 'clear';
  if (level === 'watch' || level === 'medium') return 'watch';
  if (
    level === 'elevated' ||
    level === 'high' ||
    level === 'triggered' ||
    level === 'suspended'
  ) {
    return 'elevated';
  }
  return active ? 'elevated' : 'clear';
}

export function deriveOperationalClassification(args: {
  gi: number;
  display_state: GIMode;
  tripwire_active: boolean;
  kv_continuity_ok: boolean | null;
  degraded_agent_count: number | null;
  gi_degraded: boolean;
  tripwire_elevated: boolean;
}): OperationalClassification {
  if (args.display_state === 'red' || args.gi < GI_BANDS.yellow) {
    return 'CRITICAL';
  }
  if (
    args.tripwire_active ||
    args.tripwire_elevated ||
    args.kv_continuity_ok === false ||
    (args.degraded_agent_count !== null && args.degraded_agent_count > 0) ||
    args.gi_degraded ||
    args.display_state === 'yellow'
  ) {
    return 'STRESSED';
  }
  return 'NOMINAL';
}

export function deriveOperationalDecisionState(args: {
  gi: number;
  stored_mode?: GIMode | null;
  tripwire_active: boolean;
  tripwire_level?: string;
  kv_continuity_ok: boolean | null;
  degraded_agent_count: number | null;
  gi_degraded: boolean;
  governance_state?: GovernanceStateLabel;
  mutation_state?: MutationStateLabel;
}): OperationalDecisionState {
  const display_state = getGiMode(args.gi);
  const terminal_status = terminalStatusFromMode(display_state);
  const tripwire_state = normalizeTripwireLevel(args.tripwire_level, args.tripwire_active);
  const tripwire_elevated = tripwire_state === 'elevated';
  const operational_classification = deriveOperationalClassification({
    gi: args.gi,
    display_state,
    tripwire_active: args.tripwire_active,
    kv_continuity_ok: args.kv_continuity_ok,
    degraded_agent_count: args.degraded_agent_count,
    gi_degraded: args.gi_degraded,
    tripwire_elevated,
  });

  const persistence_state: PersistenceStateLabel =
    args.kv_continuity_ok === true ? 'healthy' : args.kv_continuity_ok === false ? 'degraded' : 'unknown';

  const sustain_eligible = args.gi >= SUSTAIN_GI_THRESHOLD;
  const governance_state = args.governance_state ?? 'unknown';
  const mutation_state = args.mutation_state ?? 'forbidden';

  const parts: string[] = [];
  parts.push(`GI ${args.gi.toFixed(3)} (${display_state})`);
  parts.push(`operational ${operational_classification}`);
  if (tripwire_state !== 'clear') parts.push(`tripwire ${tripwire_state}`);
  if (persistence_state === 'degraded') parts.push('KV continuity degraded');
  if (args.degraded_agent_count !== null && args.degraded_agent_count > 0) {
    parts.push(`${args.degraded_agent_count} degraded agents`);
  } else if (args.degraded_agent_count === null) {
    parts.push('agent degradation unknown');
  }
  if (governance_state === 'disputed') parts.push('governance disputed');
  parts.push(`mutation ${mutation_state}`);

  return {
    display_state,
    operational_classification,
    terminal_status,
    tripwire_state,
    persistence_state,
    sustain_eligible,
    governance_state,
    mutation_state,
    decision_summary: parts.join('; '),
  };
}
