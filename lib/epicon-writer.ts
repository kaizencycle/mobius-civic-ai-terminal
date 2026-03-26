import { createClient } from '@vercel/kv';

/** Same list as /api/epicon/feed and /api/ledger/backfill (Upstash / Vercel KV). */
const EPICON_FEED_LIST_KEY = 'mobius:epicon:feed';

function getKvRestConfig(): { url: string; token: string } | null {
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  if (kvUrl && kvToken) {
    return { url: kvUrl, token: kvToken };
  }
  const upUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (upUrl && upToken) {
    return { url: upUrl, token: upToken };
  }
  return null;
}

let _client: ReturnType<typeof createClient> | null = null;

function getKvClient(): ReturnType<typeof createClient> | null {
  if (_client) return _client;
  const cfg = getKvRestConfig();
  if (!cfg) return null;
  _client = createClient(cfg);
  return _client;
}

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

const WRITE_TYPES: readonly EpiconWritePayload['type'][] = [
  'heartbeat',
  'catalog',
  'zeus-verify',
  'zeus-report',
  'epicon',
  'merge',
];

const WRITE_SEVERITIES: readonly EpiconWritePayload['severity'][] = [
  'nominal',
  'degraded',
  'elevated',
  'critical',
  'info',
];

export function isEpiconWritePayload(value: unknown): value is EpiconWritePayload {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.type === 'string' &&
    (WRITE_TYPES as readonly string[]).includes(o.type) &&
    typeof o.severity === 'string' &&
    (WRITE_SEVERITIES as readonly string[]).includes(o.severity) &&
    typeof o.title === 'string' &&
    typeof o.author === 'string'
  );
}

export async function readEpiconFeedSlice(limit: number): Promise<unknown[]> {
  const capped = Math.min(Math.max(limit, 1), 100);
  if (!getKvRestConfig()) {
    return [];
  }
  const client = getKvClient();
  if (!client) {
    return [];
  }

  try {
    const raw = await client.lrange<string>(EPICON_FEED_LIST_KEY, 0, capped - 1);
    return raw
      .map((entry) => {
        try {
          return JSON.parse(entry) as unknown;
        } catch {
          return null;
        }
      })
      .filter((entry): entry is unknown => entry !== null);
  } catch {
    return [];
  }
}

export async function writeEpiconEntry(payload: EpiconWritePayload): Promise<string | null> {
  if (!getKvRestConfig()) {
    // KV not configured — silently skip, feed route falls back to GitHub
    return null;
  }

  const client = getKvClient();
  if (!client) {
    return null;
  }

  const id = `${Date.now().toString(36)}-${payload.type}`;
  const entry = {
    id,
    timestamp: new Date().toISOString(),
    source: 'kv-ledger' as const,
    verified: false,
    tags: [] as string[],
    ...payload,
  };

  try {
    // Prepend to list (newest first), keep max 500 entries
    await client.lpush(EPICON_FEED_LIST_KEY, JSON.stringify(entry));
    await client.ltrim(EPICON_FEED_LIST_KEY, 0, 499);
    return id;
  } catch (err) {
    console.error('[epicon-writer] KV write failed:', err);
    return null;
  }
}
