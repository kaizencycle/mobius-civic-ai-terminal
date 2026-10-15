import { loadTripwireState } from '@/lib/kv/store';

export type RuntimeTripwireLevel = 'none' | 'watch' | 'elevated' | 'nominal' | 'low' | 'medium' | 'high' | 'triggered' | 'suspended';

export type RuntimeTripwireState = {
  active: boolean;
  level: RuntimeTripwireLevel;
  reason: string;
  last_updated: string;
  triggeredBy?: 'HERMES' | 'ZEUS' | 'ATLAS' | 'operator';
};

/**
 * C-465 — provenance of a `readTripwireState()` reading.
 * 'baseline' means neither this process's memory nor KV has ever actually
 * evaluated a tripwire — it is NOT the same as an affirmative "clear".
 */
export type TripwireSource = 'memory' | 'kv' | 'merged' | 'baseline';

const BASELINE_REASON = 'No active tripwires - baseline state';

function baselineTripwireState(): RuntimeTripwireState {
  return {
    active: false,
    level: 'none',
    reason: BASELINE_REASON,
    last_updated: new Date().toISOString(),
  };
}

let tripwireState: RuntimeTripwireState = baselineTripwireState();
/**
 * True once this process instance has actually run tripwire evaluation
 * (setTripwireState called at least once). False means `tripwireState` is
 * still the cold-start literal, not a genuinely computed "clear" — C-465
 * W5/W7: a cold instance's baseline must never be presented as authoritative.
 */
let evaluated = false;

export function setTripwireState(next: RuntimeTripwireState) {
  tripwireState = next;
  evaluated = true;
}

export function getTripwireState() {
  return tripwireState;
}

/** Whether this process instance has ever actually evaluated a tripwire (vs still being at cold-start baseline). */
export function hasEvaluatedTripwireInMemory(): boolean {
  return evaluated;
}

/** Test-only: simulate a fresh/cold process. Never called from production code. */
export function __resetTripwireStoreForTests(): void {
  tripwireState = baselineTripwireState();
  evaluated = false;
}

function tripwireSeverityRank(state: Pick<RuntimeTripwireState, 'active' | 'level'>): 0 | 1 | 2 {
  if (!state.active) return 0;
  if (state.level === 'watch' || state.level === 'medium') return 1;
  return 2;
}

/**
 * Pure merge of an in-memory reading and a KV-derived reading — no I/O.
 * Worst posture wins (mirrors `mergeBreakerTripwireState` in
 * lib/gi/serverWriteCircuitBreaker.ts). Exported directly so it is
 * unit-testable without touching KV.
 *
 * - Memory not yet evaluated (cold instance) → trust KV, or 'baseline' if KV
 *   has nothing either. An unevaluated memory reading is not a real source.
 * - Memory evaluated, no KV row → memory is the only real source.
 * - Both real → worse severity wins; a tie breaks on the newer timestamp.
 */
export function mergeTripwireState(args: {
  memory: RuntimeTripwireState;
  memoryEvaluated: boolean;
  kv: RuntimeTripwireState | null;
}): RuntimeTripwireState & { source: TripwireSource } {
  if (!args.memoryEvaluated) {
    return args.kv ? { ...args.kv, source: 'kv' } : { ...args.memory, source: 'baseline' };
  }
  if (!args.kv) {
    return { ...args.memory, source: 'memory' };
  }

  const memRank = tripwireSeverityRank(args.memory);
  const kvRank = tripwireSeverityRank(args.kv);
  if (memRank !== kvRank) {
    return memRank > kvRank ? { ...args.memory, source: 'merged' } : { ...args.kv, source: 'merged' };
  }

  const memMs = Date.parse(args.memory.last_updated);
  const kvMs = Date.parse(args.kv.last_updated);
  if (Number.isFinite(memMs) && Number.isFinite(kvMs) && kvMs > memMs) {
    return { ...args.kv, source: 'merged' };
  }
  return { ...args.memory, source: 'merged' };
}

function isKnownTripwireLevel(value: unknown): value is RuntimeTripwireLevel {
  return (
    value === 'none' ||
    value === 'watch' ||
    value === 'elevated' ||
    value === 'nominal' ||
    value === 'low' ||
    value === 'medium' ||
    value === 'high' ||
    value === 'triggered' ||
    value === 'suspended'
  );
}

/**
 * C-465 — `KV_KEYS.TRIPWIRE_STATE` ('tripwire:state') is also written by an
 * unrelated system: `app/api/cron/watchdog/route.ts` and
 * `lib/watchdog/kvWatchdogEscalation.ts` persist a `TrustTripwireSnapshot`
 * (lib/tripwire/types.ts — KV integrity/trust checks) to this exact same
 * key, which happens to share the `elevated`/`tripwireCount`/`timestamp`
 * field names but carries a `results` array and `ok`/`critical` flags
 * instead of a `cycleId`. Without this guard, a watchdog-authored row would
 * be silently misread as the signal engine's civic-tripwire record — on a
 * cold instance, if the watchdog's own `elevated` happened to be false,
 * that would overwrite a real, signal-engine-persisted elevation with a
 * false "clear" for every new reader this PR adds. Rejecting an
 * unrecognized shape and falling back to memory/baseline is the safe
 * default; it does not fix the underlying key collision (pre-existing,
 * predates this PR — see `lib/gi/serverWriteCircuitBreaker.ts`'s
 * `resolveBreakerTripwireState()`, which already read this same key before
 * C-465), which is a KV-schema fix for a human operator, not this PR.
 */
export function isSignalEngineTripwireRow(value: unknown): value is {
  cycleId: string;
  elevated: boolean;
  tripwireCount: number;
  timestamp: string;
  level?: string;
  reason?: string;
} {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if ('results' in v || 'critical' in v) return false;
  return typeof v.cycleId === 'string' && typeof v.elevated === 'boolean' && typeof v.timestamp === 'string';
}

/**
 * Maps the KV-persisted shape (`TripwireKVState` in lib/kv/store.ts — written
 * by both the signal engine, which includes `level`/`reason`, and the
 * tripwire/status POST handler, which does not) into the richer runtime
 * shape. Never invents a specific reason/level beyond what the boolean
 * `elevated` honestly supports. Callers must check `isSignalEngineTripwireRow`
 * first.
 */
export function tripwireKvRowToRuntimeState(row: {
  elevated: boolean;
  tripwireCount: number;
  timestamp: string;
  level?: string;
  reason?: string;
}): RuntimeTripwireState {
  if (!row.elevated) {
    return {
      active: false,
      level: 'none',
      reason: row.reason ?? BASELINE_REASON,
      last_updated: row.timestamp,
    };
  }
  // C-465: Cursor Bugbot (PR #710) — defaulting an unspecified level to
  // 'elevated' (the worst rank) meant a level-less KV row (legacy writes
  // before this fix, or any future caller that omits it) would *always* beat
  // a memory reading's real 'medium'/'watch' in the worst-wins merge below,
  // inflating a genuine medium tripwire to "elevated" on every read. 'watch'
  // is the honest default: we know elevated=true is not clear, but not its
  // specific severity, so we claim the minimum non-clear rank, not the
  // maximum.
  const level: RuntimeTripwireLevel = isKnownTripwireLevel(row.level) ? row.level : 'watch';
  return {
    active: true,
    level,
    reason: row.reason ?? `Tripwire elevated per persisted KV record (count=${row.tripwireCount})`,
    last_updated: row.timestamp,
  };
}

/**
 * C-465 B1 — read-through tripwire authority. Merges this process's in-memory
 * reading with the KV-persisted reading (worst posture wins) so a cold
 * instance never silently presents a baseline as an affirmative "clear",
 * and a stale in-memory "clear" never masks a real, KV-persisted elevation
 * from another instance. Read-only — never writes KV or memory.
 */
export async function readTripwireState(): Promise<RuntimeTripwireState & { source: TripwireSource }> {
  let kv: RuntimeTripwireState | null = null;
  try {
    const row = await loadTripwireState();
    kv = row && isSignalEngineTripwireRow(row) ? tripwireKvRowToRuntimeState(row) : null;
  } catch {
    kv = null;
  }
  return mergeTripwireState({
    memory: getTripwireState(),
    memoryEvaluated: hasEvaluatedTripwireInMemory(),
    kv,
  });
}
