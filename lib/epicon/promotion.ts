import { kvGet, kvSet } from '@/lib/kv/store';

export type PromotionStateValue = {
  promotion_state: 'pending' | 'selected' | 'promoted' | 'failed';
  assigned_agents: string[];
  committed_entries: string[];
  failed_attempts: number;
  last_attempt_at: string;
};

export type PromotionStateMap = Record<string, PromotionStateValue>;

const PROMOTION_STATE_KEY = 'epicon:promotion:state';

const memoryState: PromotionStateMap = {};

export async function getPromotionState(): Promise<PromotionStateMap> {
  const fromKv = await kvGet<PromotionStateMap>(PROMOTION_STATE_KEY);
  if (fromKv && typeof fromKv === 'object') {
    return fromKv;
  }
  return { ...memoryState };
}

export async function savePromotionState(state: PromotionStateMap): Promise<void> {
  Object.assign(memoryState, state);
  await kvSet(PROMOTION_STATE_KEY, state);
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
