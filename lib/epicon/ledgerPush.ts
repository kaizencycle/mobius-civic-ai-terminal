/**
 * Push one EPICON entry to Redis list mobius:epicon:feed (and mirror to in-memory when Redis absent).
 */

import { Redis } from '@upstash/redis';

import type { EpiconLedgerFeedEntry } from '@/lib/epicon/ledgerFeedTypes';
import { pushMemoryLedgerEntry } from '@/lib/epicon/memoryLedgerFeed';

export const EPICON_LEDGER_LIST_KEY = 'mobius:epicon:feed';

function getRedisClient(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    return new Redis({ url, token });
  } catch {
    return null;
  }
}

export async function pushLedgerEntry(entry: EpiconLedgerFeedEntry): Promise<{ ledgerPosition: number }> {
  const redis = getRedisClient();
  const payload = JSON.stringify(entry);

  if (redis) {
    await redis.lpush(EPICON_LEDGER_LIST_KEY, payload);
    await redis.ltrim(EPICON_LEDGER_LIST_KEY, 0, 499);
    return { ledgerPosition: 0 };
  }

  pushMemoryLedgerEntry(entry);
  return { ledgerPosition: 0 };
}
