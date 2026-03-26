import { createClient, type VercelKV } from '@vercel/kv';

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

const FEED_KEY_SPEC = 'epicon:feed';
const FEED_KEY_APP = 'mobius:epicon:feed';
const MAX_ENTRIES = 499;

function getKvClient(): VercelKV | null {
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  if (kvUrl && kvToken) {
    return createClient({ url: kvUrl, token: kvToken });
  }

  const upUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (upUrl && upToken) {
    return createClient({ url: upUrl, token: upToken });
  }

  return null;
}

async function pushFeed(client: VercelKV, serialized: string): Promise<void> {
  await client.lpush(FEED_KEY_SPEC, serialized);
  await client.ltrim(FEED_KEY_SPEC, 0, MAX_ENTRIES);
  await client.lpush(FEED_KEY_APP, serialized);
  await client.ltrim(FEED_KEY_APP, 0, MAX_ENTRIES);
}

export async function writeEpiconEntry(payload: EpiconWritePayload): Promise<string | null> {
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

  const serialized = JSON.stringify(entry);

  try {
    await pushFeed(client, serialized);
    return id;
  } catch (err) {
    console.error('[epicon-writer] KV write failed:', err);
    return null;
  }
}

export async function readEpiconFeedSlice(start: number, end: number): Promise<string[]> {
  const client = getKvClient();
  if (!client) return [];

  try {
    const raw = await client.lrange<string>(FEED_KEY_APP, start, end);
    return Array.isArray(raw) ? raw : [];
  } catch (err) {
    console.error('[epicon-writer] KV read failed:', err);
    return [];
  }
}

export function isLedgerEpiconPayload(value: unknown): value is EpiconWritePayload {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  const types: EpiconWritePayload['type'][] = [
    'heartbeat',
    'catalog',
    'zeus-verify',
    'zeus-report',
    'epicon',
    'merge',
  ];
  const severities: EpiconWritePayload['severity'][] = [
    'nominal',
    'degraded',
    'elevated',
    'critical',
    'info',
  ];
  return (
    typeof o.type === 'string' &&
    types.includes(o.type as EpiconWritePayload['type']) &&
    typeof o.severity === 'string' &&
    severities.includes(o.severity as EpiconWritePayload['severity']) &&
    typeof o.title === 'string' &&
    typeof o.author === 'string'
  );
}
