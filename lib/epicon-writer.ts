import { createClient } from '@vercel/kv';

/** Same list key as app/api/epicon/feed and app/api/ledger/backfill (mobius: prefix in Redis). */
const EPICON_FEED_KEY = 'mobius:epicon:feed';

export interface EpiconWritePayload {
  type: 'heartbeat' | 'catalog' | 'zeus-verify' | 'zeus-report' | 'epicon' | 'merge';
  severity: 'nominal' | 'degraded' | 'elevated' | 'critical' | 'info';
  title: string;
  author: string;
  gi?: number;
  anomalies?: string[];
  cycle?: string;
  tags?: string[];
  verified?: boolean;
  verifiedBy?: string;
  body?: string;
}

type EpiconKvClient = ReturnType<typeof createClient>;

function getKvClient(): EpiconKvClient | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    return createClient({ url, token });
  } catch {
    return null;
  }
}

export function isEpiconKvConfigured(): boolean {
  return getKvClient() !== null;
}

/**
 * Read newest-first JSON strings from the EPICON feed list (same source as /api/epicon/feed KV branch).
 */
export async function readEpiconFeedEntries(maxEntries: number): Promise<unknown[]> {
  const kv = getKvClient();
  if (!kv) return [];

  const end = Math.max(0, maxEntries - 1);
  try {
    const raw = await kv.lrange<string>(EPICON_FEED_KEY, 0, end);
    return raw
      .map((entry) => {
        try {
          return JSON.parse(entry) as unknown;
        } catch {
          return null;
        }
      })
      .filter((entry): entry is unknown => entry !== null);
  } catch (err) {
    console.error('[epicon-writer] KV read failed:', err);
    return [];
  }
}

export async function writeEpiconEntry(payload: EpiconWritePayload): Promise<string | null> {
  const kv = getKvClient();
  if (!kv) {
    // KV not configured — silently skip, feed route falls back to GitHub
    return null;
  }

  const id = `${Date.now().toString(36)}-${payload.type}`;
  const entry = {
    id,
    timestamp: new Date().toISOString(),
    source: 'kv-ledger' as const,
    verified: false,
    tags: [],
    ...payload,
  };

  try {
    // Prepend to list (newest first), keep max 500 entries
    await kv.lpush(EPICON_FEED_KEY, JSON.stringify(entry));
    await kv.ltrim(EPICON_FEED_KEY, 0, 499);
    return id;
  } catch (err) {
    console.error('[epicon-writer] KV write failed:', err);
    return null;
  }
}
