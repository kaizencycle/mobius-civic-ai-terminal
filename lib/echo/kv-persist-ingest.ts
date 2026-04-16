/**
 * Persist ECHO ingest side-effects to Upstash (ECHO_STATE, epicon:feed, mii:feed).
 * Used by POST /api/echo/ingest and stale GET /api/echo/feed so cold starts still populate KV.
 */

import { Redis } from '@upstash/redis';
import type { IngestResult } from '@/lib/echo/transform';
import type { IntegrityRating } from '@/lib/echo/integrity-engine';
import { getEchoStatus } from '@/lib/echo/store';
import { saveEchoState, loadGIState, kvSet, KV_KEYS } from '@/lib/kv/store';
import { readMiiFeed, type MiiEntry } from '@/lib/kv/mii';
import { currentCycleId } from '@/lib/eve/cycle-engine';

type KvEpiconEntry = {
  id: string;
  timestamp: string;
  author: string;
  title: string;
  type: 'epicon';
  severity: 'nominal' | 'elevated' | 'critical' | 'degraded' | 'info';
  source: 'kv-ledger';
  tags: string[];
  verified: boolean;
  category: string;
  confidenceTier: number;
  /** Mirrors EPICON lane status so cold-start ledger parse can promote verified T2. */
  epiconStatus: 'verified' | 'pending' | 'contradicted';
  /** ECHO integrity-engine attestation for this EPICON (ratings + verdict). */
  integrityAttestation?: IntegrityRating;
};

let _echoRedis: Redis | null | undefined;

function getRedisClient(): Redis | null {
  if (_echoRedis === null) return null;
  if (_echoRedis) return _echoRedis;

  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    _echoRedis = null;
    return null;
  }
  try {
    _echoRedis = new Redis({ url, token });
    return _echoRedis;
  } catch {
    _echoRedis = null;
    return null;
  }
}

function toFeedSeverity(confidenceTier: number): KvEpiconEntry['severity'] {
  if (confidenceTier >= 3) return 'critical';
  if (confidenceTier >= 2) return 'elevated';
  if (confidenceTier >= 1) return 'nominal';
  return 'info';
}

function toFeedTimestamp(rawTimestamp: string): string {
  const ts = new Date(rawTimestamp);
  if (Number.isNaN(ts.getTime())) return new Date().toISOString();
  return ts.toISOString();
}

export async function flushEpiconFeedToKv(entries: KvEpiconEntry[]): Promise<void> {
  const redis = getRedisClient();
  if (!redis || entries.length === 0) return;
  try {
    const payload = entries.map((entry) => JSON.stringify(entry));
    const pipe = redis.pipeline();
    pipe.lpush('epicon:feed', ...payload);
    pipe.ltrim('epicon:feed', 0, 99);
    await pipe.exec();
    // epicon:feed LPUSH count: entries.length
  } catch (error) {
    console.error('[echo] epicon feed flush failed:', error);
  }
}

export async function writeEchoKvHeartbeatToMobius(
  status: ReturnType<typeof getEchoStatus>,
  healthy = true,
): Promise<void> {
  const now = new Date().toISOString();
  const payload = {
    cycleId: currentCycleId(),
    lastIngest: now,
    totalIngested: status.totalIngested,
    duplicateSuppressed: status.duplicateSuppressedCount,
    healthy,
    timestamp: now,
  };
  try {
    // ECHO_STATE write
    await kvSet(KV_KEYS.ECHO_STATE_KV, payload, 7200);
  } catch (error) {
    console.error('[echo] ECHO_STATE KV heartbeat failed:', error);
  }
}

async function writeMiiFeedBatch(entries: MiiEntry[]): Promise<void> {
  const redis = getRedisClient();
  if (!redis || entries.length === 0) return;
  try {
    const packed = entries.map((entry) => JSON.stringify(entry));
    const pipe = redis.pipeline();
    for (const entry of entries) {
      pipe.set(`mii:${entry.agent.toUpperCase()}:${entry.cycle}`, JSON.stringify(entry));
    }
    pipe.lpush('mii:feed', ...packed);
    pipe.ltrim('mii:feed', 0, 499);
    await pipe.exec();
  } catch (error) {
    console.error('[echo] mii batch write failed:', error);
  }
}

/**
 * After pushIngestResult(result): KV heartbeat, echo:state summary, epicon feed, MII batch.
 */
export async function persistEchoIngestSideEffects(result: IngestResult): Promise<void> {
  const status = getEchoStatus();
  const dedupDenominator = Math.max(1, status.totalIngested + status.duplicateSuppressedCount);
  const dedupRate = Number((status.duplicateSuppressedCount / dedupDenominator).toFixed(3));
  await Promise.all([
    writeEchoKvHeartbeatToMobius(status),
    saveEchoState({
      lastIngest: status.lastIngest,
      cycleId: status.cycleId,
      totalIngested: status.totalIngested,
      healthy: true,
      epiconCount: status.counts.epicon,
      ledgerCount: status.counts.ledger,
      alertCount: status.counts.alerts,
      timestamp: new Date().toISOString(),
      dedupRate,
    }).catch(() => {}),
  ]);

  const kvFeedEntries: KvEpiconEntry[] = result.epicon.map((entry, i) => ({
    id: entry.id,
    timestamp: toFeedTimestamp(entry.timestamp),
    author: entry.ownerAgent,
    title: entry.title,
    type: 'epicon',
    severity: entry.status === 'contradicted' ? 'degraded' : toFeedSeverity(entry.confidenceTier),
    source: 'kv-ledger',
    tags: entry.sources,
    verified: entry.status === 'verified',
    category: entry.category,
    confidenceTier: entry.confidenceTier,
    epiconStatus: entry.status,
    integrityAttestation: result.integrity.ratings[i],
  }));
  await flushEpiconFeedToKv(kvFeedEntries);

  try {
    const [giState, recentFeed] = await Promise.all([loadGIState(), readMiiFeed(null, 500)]);
    const currentGi = Number((giState?.global_integrity ?? 0.74).toFixed(4));
    const miiTimestamp = new Date().toISOString();
    const agentAverages = result.integrity.agentAverages;
    const agents = ['ATLAS', 'ZEUS', 'JADE', 'EVE'] as const;
    const lastKnown: Record<string, number> = {};
    for (const entry of recentFeed) {
      if (!(entry.agent in lastKnown)) {
        lastKnown[entry.agent] = entry.mii;
      }
    }
    const batch: MiiEntry[] = agents.map((agent) => ({
      agent,
      mii: Number((typeof agentAverages[agent] === 'number' ? agentAverages[agent] : (lastKnown[agent] ?? 0.9)).toFixed(4)),
      gi: currentGi,
      cycle: result.cycleId,
      timestamp: miiTimestamp,
      source: 'live',
    }));
    await writeMiiFeedBatch(batch);
  } catch (err) {
    console.error('[echo] mii write failed:', err instanceof Error ? err.message : err);
  }
}
