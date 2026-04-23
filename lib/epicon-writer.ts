import { createClient, kv } from '@vercel/kv';

/** Same Redis list as `app/api/epicon/feed/route.ts` (do not change without updating feed). */
const EPICON_FEED_LIST_KEY = 'mobius:epicon:feed';

export type SignalAnomalyIdentity = {
  agentName: string;
  source: string;
  severity: string;
  label: string;
};

export interface EpiconWritePayload {
  type: 'heartbeat' | 'catalog' | 'zeus-verify' | 'zeus-report' | 'epicon' | 'merge';
  severity: 'nominal' | 'degraded' | 'elevated' | 'critical' | 'info';
  title: string;
  author: string;
  gi?: number;
  anomalies?: string[];
  signalAnomalies?: SignalAnomalyIdentity[];
  cycle?: string;
  tags?: string[];
  verified?: boolean;
  verifiedBy?: string;
  body?: string;
}

function getKvClient(): ReturnType<typeof createClient> | typeof kv | null {
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    return kv;
  }
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    return createClient({ url, token });
  }
  return null;
}

export async function writeEpiconEntry(payload: EpiconWritePayload): Promise<string | null> {
  const client = getKvClient();
  if (!client) {
    // KV not configured — silently skip, feed route falls back to GitHub
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

export async function readEpiconFeedEntries(maxEntries: number): Promise<unknown[]> {
  const client = getKvClient();
  if (!client) return [];

  try {
    const end = Math.max(0, maxEntries - 1);
    const raw = await client.lrange<string>(EPICON_FEED_LIST_KEY, 0, end);
    return raw.map((entry) => {
      try {
        return JSON.parse(entry) as unknown;
      } catch {
        return null;
      }
    }).filter((item): item is NonNullable<typeof item> => item !== null);
  } catch {
    return [];
  }
}

function isEpiconSeverity(value: unknown): value is EpiconWritePayload['severity'] {
  return (
    value === 'nominal' ||
    value === 'degraded' ||
    value === 'elevated' ||
    value === 'critical' ||
    value === 'info'
  );
}

function isEpiconType(value: unknown): value is EpiconWritePayload['type'] {
  return (
    value === 'heartbeat' ||
    value === 'catalog' ||
    value === 'zeus-verify' ||
    value === 'zeus-report' ||
    value === 'epicon' ||
    value === 'merge'
  );
}

export function parseEpiconWritePayload(
  body: unknown,
): { ok: true; payload: EpiconWritePayload } | { ok: false; error: string } {
  if (body === null || typeof body !== 'object') {
    return { ok: false, error: 'Body must be a JSON object' };
  }

  const o = body as Record<string, unknown>;
  const type = o.type;
  const severity = o.severity;
  const title = o.title;
  const author = o.author;

  if (!isEpiconType(type)) {
    return { ok: false, error: 'Invalid or missing type' };
  }
  if (!isEpiconSeverity(severity)) {
    return { ok: false, error: 'Invalid or missing severity' };
  }
  if (typeof title !== 'string' || !title.trim()) {
    return { ok: false, error: 'title is required' };
  }
  if (typeof author !== 'string' || !author.trim()) {
    return { ok: false, error: 'author is required' };
  }

  const payload: EpiconWritePayload = {
    type,
    severity,
    title: title.trim(),
    author: author.trim(),
  };

  if (typeof o.gi === 'number' && Number.isFinite(o.gi)) payload.gi = o.gi;
  if (Array.isArray(o.anomalies) && o.anomalies.every((x): x is string => typeof x === 'string')) {
    payload.anomalies = o.anomalies;
  }
  if (typeof o.cycle === 'string') payload.cycle = o.cycle;
  if (Array.isArray(o.tags) && o.tags.every((x): x is string => typeof x === 'string')) {
    payload.tags = o.tags;
  }
  if (typeof o.verified === 'boolean') payload.verified = o.verified;
  if (typeof o.verifiedBy === 'string') payload.verifiedBy = o.verifiedBy;
  if (typeof o.body === 'string') payload.body = o.body;

  return { ok: true, payload };
}
