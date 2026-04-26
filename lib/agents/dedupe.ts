import { Redis } from '@upstash/redis';
import { kvGet } from '@/lib/kv/store';

const DEDUPE_TTL_SECONDS = 60 * 60 * 24 * 30;
const PREFIX = 'mobius:';

let _redis: Redis | null | undefined;

export type DedupeRecord = {
  dedupe_key: string;
  consumed_at: string;
  agent: string;
  action: string;
  payload_hash: string;
};

function keyFor(dedupeKey: string): string {
  return `agent:dedupe:${dedupeKey}`;
}

function prefixedKeyFor(dedupeKey: string): string {
  return `${PREFIX}${keyFor(dedupeKey)}`;
}

function getRedis(): Redis | null {
  if (_redis !== undefined) return _redis;
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const secret = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !secret) {
    _redis = null;
    return null;
  }
  try {
    _redis = new Redis({ url, token: secret });
    return _redis;
  } catch {
    _redis = null;
    return null;
  }
}

export async function readDedupeRecord(dedupeKey: string): Promise<DedupeRecord | null> {
  return kvGet<DedupeRecord>(keyFor(dedupeKey));
}

async function claimDedupeRecord(dedupeKey: string, record: DedupeRecord): Promise<'claimed' | 'exists' | 'unavailable'> {
  const redis = getRedis();
  if (!redis) return 'unavailable';
  try {
    const result = await redis.set(prefixedKeyFor(dedupeKey), record, { ex: DEDUPE_TTL_SECONDS, nx: true });
    return result === 'OK' ? 'claimed' : 'exists';
  } catch {
    return 'unavailable';
  }
}

export async function consumeDedupeKey(args: {
  dedupe_key: string;
  agent: string;
  action: string;
  payload_hash: string;
}): Promise<
  | { ok: true; record: DedupeRecord }
  | { ok: false; existing: DedupeRecord }
  | { ok: false; error: 'dedupe_store_unavailable' }
> {
  const record: DedupeRecord = {
    dedupe_key: args.dedupe_key,
    consumed_at: new Date().toISOString(),
    agent: args.agent,
    action: args.action,
    payload_hash: args.payload_hash,
  };

  const claim = await claimDedupeRecord(args.dedupe_key, record);
  if (claim === 'claimed') return { ok: true, record };
  if (claim === 'exists') {
    const existing = await readDedupeRecord(args.dedupe_key);
    return { ok: false, existing: existing ?? { ...record, consumed_at: 'existing_claim' } };
  }
  return { ok: false, error: 'dedupe_store_unavailable' };
}
