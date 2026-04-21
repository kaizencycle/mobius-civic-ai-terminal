/**
 * MII Truth Pipe — Mobius Integrity Index state recorder
 *
 * Each agent records its MII score after a synthesis or verification action.
 * This is the integrity score of each agent, recorded over time — not events,
 * not reasoning, not observations. Scores only.
 *
 * Schema:
 *   Key:   mii:{AGENT_UPPERCASE}:{CYCLE_ID}  → latest score for agent in cycle
 *   Feed:  mii:feed                          → LPUSH rolling list (max 500)
 *
 * Reads:
 *   GET /api/mii/feed  → last 200 entries by default, optional ?agent= & ?limit=
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
/** C-287 O9 — cap feed list size (matches echo batch trim). */
const FEED_MAX = 100;

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
const MII_DELTA_SKIP = 0.01;

/** Skip MII rows when score barely moved vs last known per agent (echo ingest batch path). */
export function filterMiiEntriesNeedingWrite(entries: MiiEntry[], lastMiiByAgent: Record<string, number>): MiiEntry[] {
  return entries.filter((e) => {
    const prev = lastMiiByAgent[e.agent];
    if (prev === undefined || !Number.isFinite(prev)) return true;
    return Math.abs(e.mii - prev) >= MII_DELTA_SKIP;
  });
}

export async function writeMiiState(entry: MiiEntry): Promise<void> {
  const redis = getMiiRedisClient();
  if (!redis) return;

  const key = `mii:${entry.agent.toUpperCase()}:${entry.cycle}`;
  const packed = JSON.stringify(entry);

  try {
    const prevRaw = await redis.get<string>(key);
    if (prevRaw) {
      try {
        const prev = JSON.parse(prevRaw) as { mii?: number };
        if (typeof prev.mii === 'number' && Number.isFinite(prev.mii)) {
          if (Math.abs(prev.mii - entry.mii) < MII_DELTA_SKIP) {
            return;
          }
        }
      } catch {
        /* fall through to write */
      }
    }
    const sevenDaysSec = 86400 * 7;
    await redis.set(key, packed, { ex: sevenDaysSec });
    await redis.lpush(FEED_KEY, packed);
    await redis.ltrim(FEED_KEY, 0, 99);
  } catch (error) {
    console.error('[mii] write failed:', error instanceof Error ? error.message : error);
  }
}

const DEFAULT_READ_LIMIT = 200;
const MAX_READ_LIMIT = 500;

/**
 * Read the rolling mii:feed. Returns up to `limit` entries (default 200, max 500).
 * Optionally filtered by agent name (case-insensitive).
 */
export async function readMiiFeed(agentFilter?: string | null, limit = DEFAULT_READ_LIMIT): Promise<MiiEntry[]> {
  const redis = getMiiRedisClient();
  if (!redis) return [];

  const normalizedFilter = agentFilter ? agentFilter.trim().toUpperCase() : null;
  const cap = Number.isFinite(limit) ? Math.min(Math.max(1, Math.floor(limit)), MAX_READ_LIMIT) : DEFAULT_READ_LIMIT;

  try {
    const raw = await redis.lrange<string>(FEED_KEY, 0, cap - 1);
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
