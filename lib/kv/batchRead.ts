/**
 * Single-round-trip reads for Upstash REST (reduces command count vs N× GET).
 */

import { Redis } from '@upstash/redis';

let _redis: Redis | null = null;

function getRedis(): Redis | null {
  if (_redis) return _redis;
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    _redis = new Redis({ url, token });
    return _redis;
  } catch {
    return null;
  }
}

const PREFIX = 'mobius:';

function fullKey(logical: string): string {
  return `${PREFIX}${logical}`;
}

/**
 * MGET for prefixed Mobius keys. One REST command for all keys.
 * Returns null entries for missing keys; order matches input.
 */
export async function kvMgetPrefixedLogicalKeys(logicalKeys: readonly string[]): Promise<unknown[]> {
  const redis = getRedis();
  if (!redis || logicalKeys.length === 0) {
    return logicalKeys.map(() => null);
  }
  const keys = logicalKeys.map(fullKey);
  try {
    const values = await redis.mget(...keys);
    return Array.isArray(values) ? values : logicalKeys.map(() => null);
  } catch (err) {
    console.warn('[mobius-kv] mget failed:', err instanceof Error ? err.message : err);
    return logicalKeys.map(() => null);
  }
}
