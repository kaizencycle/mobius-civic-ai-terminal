import { kvGet, kvSet } from '@/lib/kv/store';

export type ZeusDisputeEvent = {
  id: string;
  cycle: string;
  gi_at_dispute: number | null;
  zeus_raw: string;
  zeus_resolved: string;
  prior_verdict: string | null;
  recorded_at: string;
};

const DISPUTE_LOG_KEY = 'epicon:zeus-disputes';

export async function recordDisputeEvent(event: Omit<ZeusDisputeEvent, 'id' | 'recorded_at'>): Promise<void> {
  const full: ZeusDisputeEvent = {
    ...event,
    id: `dispute-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    recorded_at: new Date().toISOString(),
  };

  // Abort on read uncertainty — treating null-from-failure as empty would overwrite history.
  const log = await kvGet<ZeusDisputeEvent[]>(DISPUTE_LOG_KEY);
  if (log === null) {
    throw new Error('[epicon/dispute] KV read returned null — aborting to avoid overwriting dispute history');
  }

  const updated = [full, ...log].slice(0, 200);

  // kvSet returns false on bridge-path rejection without throwing; surface that as a failure.
  const ok = await kvSet(DISPUTE_LOG_KEY, updated, 60 * 60 * 24 * 30); // 30d TTL
  if (!ok) {
    throw new Error(`[epicon/dispute] KV write rejected for key ${DISPUTE_LOG_KEY}`);
  }

  console.info('[epicon/dispute] recorded', full.id, { cycle: full.cycle, gi: full.gi_at_dispute });
}
