/**
 * MII Truth Pipe — Mobius Integrity Index state recorder
 *
 * Each agent records its MII score after a synthesis or verification action.
 * This is the integrity score of each agent, recorded over time — not events,
 * not reasoning, not observations. Scores only.
 *
 * Schema:
 *   Key:   mii:{AGENT_UPPERCASE}:{CYCLE_ID}  → latest score for agent in cycle
 *   Feed:  mii:feed                          → LPUSH rolling list (max 200)
 *
 * Reads:
 *   GET /api/mii/feed  → last 100 entries, optional ?agent= filter
 */

import { Redis } from '@upstash/redis';

export type MiiEntry = {
  agent: string;    // e.g. "ZEUS"
  mii: number;      // 0.00–1.00
  gi: number;       // global integrity at time of write
  cycle: string;    // e.g. "C-279"
  timestamp: string; // ISO 8601
  source: 'live';   // always "live", never "mock"
};

const FEED_KEY = 'mii:feed';
const FEED_MAX = 200;

function getMiiRedisClient(): Redis | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    return new Redis({ url, token });
  } catch {
    return null;
  }
}

function isMiiEntry(value: unknown): value is MiiEntry {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.agent === 'string' &&
    typeof v.mii === 'number' &&
    typeof v.gi === 'number' &&
    typeof v.cycle === 'string' &&
    typeof v.timestamp === 'string' &&
    v.source === 'live'
  );
}

/**
 * Write one agent's MII state to KV.
 * - Sets mii:{AGENT}:{CYCLE} to the entry (latest score for that agent/cycle pair)
 * - LPUSHes to mii:feed and LTRIMs to FEED_MAX
 */
export async function writeMiiState(entry: MiiEntry): Promise<void> {
  const redis = getMiiRedisClient();
  if (!redis) return;

  const key = `mii:${entry.agent.toUpperCase()}:${entry.cycle}`;
  const packed = JSON.stringify(entry);

  try {
    await redis.set(key, packed);
    await redis.lpush(FEED_KEY, packed);
    await redis.ltrim(FEED_KEY, 0, FEED_MAX - 1);
  } catch (error) {
    console.error('[mii] write failed:', error instanceof Error ? error.message : error);
  }
}

/**
 * Read the rolling mii:feed. Returns up to 100 entries.
 * Optionally filtered by agent name (case-insensitive).
 */
export async function readMiiFeed(agentFilter?: string | null): Promise<MiiEntry[]> {
  const redis = getMiiRedisClient();
  if (!redis) return [];

  const normalizedFilter = agentFilter ? agentFilter.trim().toUpperCase() : null;

  try {
    const raw = await redis.lrange<string>(FEED_KEY, 0, 99);
    const entries: MiiEntry[] = [];

    for (const item of raw) {
      try {
        const parsed: unknown = typeof item === 'string' ? JSON.parse(item) : item;
        if (!isMiiEntry(parsed)) continue;
        if (normalizedFilter && parsed.agent.toUpperCase() !== normalizedFilter) continue;
        entries.push(parsed);
      } catch {
        // skip malformed entries
      }
    }

    return entries;
  } catch (error) {
    console.error('[mii] read failed:', error instanceof Error ? error.message : error);
    return [];
  }
}
