/**
 * KV side-effects at the end of EVE cycle synthesis cron (heartbeat freshness).
 * Uses mobius-prefixed keys via kvSet — same as /api/runtime/heartbeat.
 */

import { kvSet, KV_KEYS, loadSignalSnapshot } from '@/lib/kv/store';

export async function writeSynthesisCronHeartbeatKv(gi: number, cycle: string): Promise<void> {
  const snap = await loadSignalSnapshot().catch(() => null);
  const anomalies = typeof snap?.anomalies === 'number' ? snap.anomalies : snap?.allSignals?.length ?? 0;
  const timestamp = new Date().toISOString();
  const payload = JSON.stringify({
    ok: true,
    gi: Number(gi.toFixed(4)),
    cycle,
    anomalies,
    timestamp,
    source: 'synthesis-cron',
  });
  await kvSet(KV_KEYS.HEARTBEAT, payload);
}
