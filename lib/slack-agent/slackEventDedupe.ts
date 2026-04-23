import { createClient, kv } from '@vercel/kv';

const KEY_PREFIX = 'mobius:slack-agent:event:';
const TTL_SECONDS = 60 * 60 * 48; // 48h — Slack may retry

/** In-process fallback when KV is not configured (single-instance only). */
const memorySeen = new Set<string>();
const MEMORY_MAX = 500;

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

/** True when Upstash / Vercel KV env is present (KV-backed Slack event dedupe available). */
export function slackDedupeKvConfigured(): boolean {
  return getKvClient() != null;
}

/**
 * Returns true if this event_id should be processed (first time),
 * false if duplicate (Slack retry or another instance already handled).
 */
export async function claimSlackEventId(eventId: string): Promise<boolean> {
  if (!eventId) return true;
  const client = getKvClient();
  if (!client) {
    if (memorySeen.has(eventId)) return false;
    memorySeen.add(eventId);
    if (memorySeen.size > MEMORY_MAX) {
      const first = memorySeen.values().next().value as string | undefined;
      if (first) memorySeen.delete(first);
    }
    return true;
  }
  const key = `${KEY_PREFIX}${eventId}`;
  try {
    const r = await client.set(key, '1', { nx: true, ex: TTL_SECONDS });
    return r === 'OK';
  } catch (err) {
    console.error('[slack-event-dedupe] KV claim failed:', err);
    if (memorySeen.has(eventId)) return false;
    memorySeen.add(eventId);
    return true;
  }
}
