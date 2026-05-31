import { kvSet } from '@/lib/kv/store';

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

  let log: ZeusDisputeEvent[] = [];
  try {
    const { kvGet } = await import('@/lib/kv/store');
    log = (await kvGet<ZeusDisputeEvent[]>(DISPUTE_LOG_KEY)) ?? [];
  } catch {
    log = [];
  }

  log.unshift(full);
  if (log.length > 200) log.length = 200;

  await kvSet(DISPUTE_LOG_KEY, log, 60 * 60 * 24 * 30); // 30d TTL
  console.info('[epicon/dispute] recorded', full.id, { cycle: full.cycle, gi: full.gi_at_dispute });
}
