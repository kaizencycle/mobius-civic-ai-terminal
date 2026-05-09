// C-306: SCAN-based key iteration — replaces redis.keys() which hits Upstash key limit
import { Redis } from '@upstash/redis';

function getRedis(): Redis | null {
  const url   = process.env.KV_REST_API_URL   ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try { return new Redis({ url, token }); } catch { return null; }
}

export async function scanKeys(
  pattern: string,
  limit = 200,
): Promise<string[]> {
  const redis = getRedis();
  if (!redis) return [];

  const keys: string[] = [];
  let cursor = 0;

  do {
    const [nextCursor, batch] = await redis.scan(cursor, { match: pattern, count: 100 });
    keys.push(...batch);
    cursor = Number(nextCursor);
    if (keys.length >= limit) break;
  } while (cursor !== 0);

  return keys.slice(0, limit);
}

export async function scanAndGet<T>(
  pattern: string,
  limit = 200,
): Promise<{ key: string; value: T }[]> {
  const redis = getRedis();
  if (!redis) return [];

  const keys = await scanKeys(pattern, limit);
  if (!keys.length) return [];

  const values = await Promise.all(keys.map(k => redis.get<T>(k)));
  return keys
    .map((key, i) => ({ key, value: values[i] as T }))
    .filter(({ value }) => value != null);
}
