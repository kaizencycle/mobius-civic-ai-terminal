import { kvGet, kvSet } from '@/lib/kv/store';

const DEDUPE_TTL_SECONDS = 60 * 60 * 24 * 30;

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

export async function readDedupeRecord(dedupeKey: string): Promise<DedupeRecord | null> {
  return kvGet<DedupeRecord>(keyFor(dedupeKey));
}

export async function consumeDedupeKey(args: {
  dedupe_key: string;
  agent: string;
  action: string;
  payload_hash: string;
}): Promise<{ ok: true; record: DedupeRecord } | { ok: false; existing: DedupeRecord }> {
  const existing = await readDedupeRecord(args.dedupe_key);
  if (existing) return { ok: false, existing };

  const record: DedupeRecord = {
    dedupe_key: args.dedupe_key,
    consumed_at: new Date().toISOString(),
    agent: args.agent,
    action: args.action,
    payload_hash: args.payload_hash,
  };
  await kvSet(keyFor(args.dedupe_key), record, DEDUPE_TTL_SECONDS);
  return { ok: true, record };
}
