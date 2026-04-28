import { kvGet, kvSet } from '@/lib/kv/store';

export type PromotionStateValue = {
  promotion_state: 'pending' | 'selected' | 'promoted' | 'failed';
  assigned_agents: string[];
  committed_entries: string[];
  failed_attempts: number;
  last_attempt_at: string;
  promoted_at?: string;
};

export type PromotionStateMap = Record<string, PromotionStateValue>;

// 72h TTL — covers any cycle overlap without leaking into the next cycle
const PROMOTION_STATE_TTL_SECONDS = 60 * 60 * 72;

// In-memory mirror keyed by cycleId — survives KV outages within a single process.
// Scoped by cycle so stale data from a prior cycle never bleeds into a new one.
const memoryMirror = new Map<string, PromotionStateMap>();

function cycleKey(cycleId: string): string {
  return `epicon:promotion:state:${cycleId}`;
}

export async function getPromotionState(cycleId: string): Promise<PromotionStateMap> {
  const fromKv = await kvGet<PromotionStateMap>(cycleKey(cycleId));
  if (fromKv && typeof fromKv === 'object') {
    // Keep mirror in sync whenever KV is healthy
    memoryMirror.set(cycleId, fromKv);
    return fromKv;
  }
  // KV unavailable — return in-process mirror so promoted IDs are not forgotten
  return memoryMirror.get(cycleId) ?? {};
}

export async function savePromotionState(state: PromotionStateMap, cycleId: string): Promise<void> {
  // Always update memory mirror first so the next getPromotionState within the same
  // process sees the latest state even if the KV write below is slow or fails.
  memoryMirror.set(cycleId, state);
  await kvSet(cycleKey(cycleId), state, PROMOTION_STATE_TTL_SECONDS);
}

export function defaultPromotionState(nowIso: string): PromotionStateValue {
  return {
    promotion_state: 'pending',
    assigned_agents: [],
    committed_entries: [],
    failed_attempts: 0,
    last_attempt_at: nowIso,
  };
}

// Stall counter — incremented each run where zero items are promoted.
// Auto-expires after 72h so a dead cycle doesn't poison the next one.
const STALL_TTL_SECONDS = 60 * 60 * 72;

export async function incrementStallCounter(cycleId: string): Promise<number> {
  const key = `epicon:promotion:stall:${cycleId}`;
  const current = (await kvGet<number>(key)) ?? 0;
  const next = current + 1;
  await kvSet(key, next, STALL_TTL_SECONDS);
  return next;
}

export async function resetStallCounter(cycleId: string): Promise<void> {
  // Write 0 with TTL rather than delete so the key exists for diagnostics
  await kvSet(`epicon:promotion:stall:${cycleId}`, 0, STALL_TTL_SECONDS);
}

export async function getStallCount(cycleId: string): Promise<number> {
  return (await kvGet<number>(`epicon:promotion:stall:${cycleId}`)) ?? 0;
}

// Keys that the one-time admin flush endpoint should clear for a given cycle.
export function promotionFlushKeys(cycleId: string): string[] {
  return [
    `epicon:promotion:state:${cycleId}`,
    `epicon:promotion:stall:${cycleId}`,
    // Legacy global key (no cycle scope) written before this fix shipped
    'epicon:promotion:state',
  ];
}
