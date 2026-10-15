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
 * Maps the KV-persisted shape (`TripwireKVState` in lib/kv/store.ts — written
 * by both the signal engine, which includes `level`/`reason`, and the
 * tripwire/status POST handler, which does not) into the richer runtime
 * shape. Never invents a specific reason/level beyond what the boolean
 * `elevated` honestly supports.
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
  const level: RuntimeTripwireLevel = isKnownTripwireLevel(row.level) ? row.level : 'elevated';
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
    kv = row ? tripwireKvRowToRuntimeState(row) : null;
  } catch {
    kv = null;
  }
  return mergeTripwireState({
    memory: getTripwireState(),
    memoryEvaluated: hasEvaluatedTripwireInMemory(),
    kv,
  });
}
