/**
 * C-286 — KV heartbeat for `/api/agents/status` (fleet roster, not process-local `setHeartbeat()`).
 */

import { resolveOperatorCycleId } from '@/lib/eve/resolve-operator-cycle';
import { isRedisAvailable, kvSet, KV_KEYS, KV_TTL_SECONDS } from '@/lib/kv/store';
import { scheduleKvBridgeDualWrite } from '@/lib/kv/kvBridgeClient';

/** Canonical Terminal fleet IDs (lowercase) — matches `app/api/agents/status/route.ts` roster order. */
export const CANONICAL_AGENT_IDS = [
  'atlas',
  'zeus',
  'hermes',
  'aurea',
  'jade',
  'daedalus',
  'echo',
  'eve',
] as const;

export type AgentHeartbeatFleetPayload = {
  ok: true;
  timestamp: string;
  cycle: string;
  source: 'cron-heartbeat' | 'heartbeat-refresh';
  agents: Array<{
    id: string;
    status: 'active';
    last_action: string;
    heartbeat_ok: true;
  }>;
};

/**
 * Writes `mobius:heartbeat:last` JSON expected by `GET /api/agents/status`.
 * TTL: 15 minutes (3× a 5-minute cron interval).
 */
export async function writeFleetHeartbeatKV(source: AgentHeartbeatFleetPayload['source']): Promise<boolean> {
  if (!isRedisAvailable()) return false;
  const timestamp = new Date().toISOString();
  let cycle = '';
  try {
    cycle = await resolveOperatorCycleId();
  } catch {
    cycle = '';
  }
  const payload: AgentHeartbeatFleetPayload = {
    ok: true,
    timestamp,
    cycle: cycle || 'unknown',
    source,
    agents: CANONICAL_AGENT_IDS.map((id) => ({
      id,
      status: 'active',
      last_action: 'heartbeat-refresh',
      heartbeat_ok: true,
    })),
  };
  const ok =
    (await kvSet(KV_KEYS.HEARTBEAT, JSON.stringify(payload), KV_TTL_SECONDS.HEARTBEAT)) &&
    (await kvSet(KV_KEYS.CURRENT_CYCLE, payload.cycle, KV_TTL_SECONDS.HEARTBEAT));
  if (ok) {
    scheduleKvBridgeDualWrite('HEARTBEAT', payload, KV_TTL_SECONDS.HEARTBEAT, 'heartbeat-dual-write');
    scheduleKvBridgeDualWrite('CURRENT_CYCLE', payload.cycle, KV_TTL_SECONDS.HEARTBEAT, 'heartbeat-dual-write');
  }
  return ok;
}
