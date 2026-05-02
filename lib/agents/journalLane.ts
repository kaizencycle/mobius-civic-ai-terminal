import { Redis } from '@upstash/redis';
import { enqueueJournalCanonWrite } from '@/lib/agents/journalCanonOutbox';
import { bumpTerminalWatermark } from '@/lib/terminal/watermark';
import type { SubstrateJournalWriteInput } from '@/lib/substrate/github-journal';

const KEY_ALL = 'journal:all';
// Hard cap — entries beyond this are dropped by ltrim. At ~15/hr this covers ~33h.
const MAX_LIST_ENTRIES = 500;
// Soft cap — warn and begin time-pruning when the list is 80% full.
const SOFT_CAP = Math.floor(MAX_LIST_ENTRIES * 0.8);
// Rolling window — entries older than this are pruned before the hard ltrim.
const ROLLING_WINDOW_MS = 72 * 60 * 60 * 1000; // 72h
const IDEMPOTENCY_TTL_SECONDS = 60 * 60 * 24 * 14;

export type AgentJournalLaneEntry = {
  id: string;
  agent: string;
  cycle: string;
  timestamp: string;
  scope: string;
  observation: string;
  inference: string;
  recommendation: string;
  confidence: number;
  derivedFrom: string[];
  status: 'draft' | 'committed' | 'contested' | 'verified';
  category: 'observation' | 'inference' | 'alert' | 'recommendation' | 'close';
  severity: 'nominal' | 'elevated' | 'critical';
  source: 'agent-journal';
  agentOrigin: string;
  tags?: string[];
  storage?: {
    hot: true;
    substrate: boolean;
    canonStatus: 'canon_pending' | 'canon_written' | 'canon_failed';
    canonicalPath?: string | null;
  };
};

export type AgentJournalLaneInput = Omit<AgentJournalLaneEntry, 'id' | 'timestamp' | 'source' | 'storage'> & {
  id?: string;
  timestamp?: string;
  canon?: boolean;
  gi_at_time?: number;
};

export function getJournalRedisClient(): Redis | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

function normalizeDerivedFrom(derivedFrom: string[]): string[] {
  return [...new Set(derivedFrom.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function asReasoningToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function idempotencyToken(agent: string, cycle: string, derivedFrom: string[]): string {
  const normalized = normalizeDerivedFrom(derivedFrom);
  const payload = normalized.join('|') || 'none';
  return `${asReasoningToken(agent)}:${asReasoningToken(cycle)}:${asReasoningToken(payload)}`;
}

function compactToken(input: string): string {
  return input.replace(/[^a-zA-Z0-9]/g, '').slice(0, 36) || 'auto';
}

// Remove entries older than ROLLING_WINDOW_MS from a Redis list key.
// Operates only when the list length exceeds SOFT_CAP to avoid unnecessary scans.
async function pruneStaleEntries(redis: Redis, key: string): Promise<number> {
  const len = await redis.llen(key);
  if (len < SOFT_CAP) return 0;

  const label = len >= MAX_LIST_ENTRIES ? 'hard-cap' : 'soft-cap';
  console.warn(`[journalLane] ${label} reached on ${key}: ${len}/${MAX_LIST_ENTRIES} entries. Running time-based prune.`);

  // Fetch all entries in one round-trip, scan from the tail to count stale ones,
  // then trim with a single LTRIM — O(2) Redis ops instead of O(3n).
  const all = await redis.lrange(key, 0, -1);
  if (all.length === 0) return 0;

  const cutoff = Date.now() - ROLLING_WINDOW_MS;
  let staleCount = 0;
  for (let i = all.length - 1; i >= 0; i--) {
    try {
      const parsed = typeof all[i] === 'string'
        ? (JSON.parse(all[i] as string) as { timestamp?: string })
        : (all[i] as { timestamp?: string });
      const ts = parsed?.timestamp ? new Date(parsed.timestamp).getTime() : 0;
      if (ts > cutoff) break; // reached a fresh entry — everything newer is clean
      staleCount += 1;
    } catch {
      break; // unparseable tail — leave it for hard ltrim
    }
  }

  if (staleCount === 0) return 0;

  if (staleCount === all.length) {
    // Every entry is stale — DEL is required because ltrim(key, 0, -1) is a no-op.
    await redis.del(key);
  } else {
    // Keep head .. (all.length - staleCount - 1), drop stale tail entries atomically.
    await redis.ltrim(key, 0, all.length - staleCount - 1);
  }
  console.warn(`[journalLane] pruned ${staleCount} stale entries from ${key}`);
  return staleCount;
}

function toSubstrateJournalInput(entry: AgentJournalLaneEntry, giAtTime?: number): SubstrateJournalWriteInput {
  return {
    id: entry.id,
    agent: entry.agent,
    agentOrigin: entry.agentOrigin,
    cycle: entry.cycle,
    scope: entry.scope,
    category: entry.category,
    severity: entry.severity,
    observation: entry.observation,
    inference: entry.inference,
    recommendation: entry.recommendation,
    confidence: entry.confidence,
    derivedFrom: entry.derivedFrom,
    source: entry.source,
    tags: entry.tags ?? [],
    ...(typeof giAtTime === 'number' && Number.isFinite(giAtTime) ? { gi_at_time: giAtTime } : {}),
    status: entry.status,
  };
}

export async function appendJournalLaneEntry(
  redis: Redis,
  input: AgentJournalLaneInput,
): Promise<{ written: true; entry: AgentJournalLaneEntry; canonQueued: boolean } | { written: false; reason: 'duplicate'; token: string }> {
  const agent = input.agent.trim().toUpperCase();
  const cycle = input.cycle.trim();
  const derivedFrom = normalizeDerivedFrom(input.derivedFrom);
  const token = idempotencyToken(agent, cycle, derivedFrom);
  const markerKey = `journal:idempotency:${token}`;

  // Always refresh agent:meta so liveness checks reflect the current sweep cadence,
  // even when the full journal entry is deduplicated by the idempotency gate below.
  await redis.hset(`agent:meta:${agent.toLowerCase()}`, {
    last_journal_at: new Date().toISOString(),
    last_journal_cycle: cycle,
  });

  const inserted = await redis.set(markerKey, '1', { nx: true, ex: IDEMPOTENCY_TTL_SECONDS });

  if (inserted !== 'OK') {
    return { written: false, reason: 'duplicate', token };
  }

  const canonEnabled = input.canon !== false;
  const entry: AgentJournalLaneEntry = {
    id: input.id?.trim() || `journal-${agent}-${cycle}-${compactToken(token)}`,
    agent,
    cycle,
    timestamp: input.timestamp?.trim() || new Date().toISOString(),
    scope: input.scope.trim(),
    observation: input.observation.trim(),
    inference: input.inference.trim(),
    recommendation: input.recommendation.trim(),
    confidence: Math.max(0, Math.min(1, input.confidence)),
    derivedFrom,
    status: input.status,
    category: input.category,
    severity: input.severity,
    source: 'agent-journal',
    agentOrigin: input.agentOrigin.trim().toUpperCase(),
    tags: input.tags,
    storage: {
      hot: true,
      substrate: false,
      canonStatus: canonEnabled ? 'canon_pending' : 'canon_failed',
      canonicalPath: null,
    },
  };

  const packed = JSON.stringify(entry);
  const agentKey = `journal:${agent.toLowerCase()}`;

  // Time-based rolling prune before hard count trim — prevents silent data loss
  await Promise.all([pruneStaleEntries(redis, KEY_ALL), pruneStaleEntries(redis, agentKey)]);

  await redis.lpush(KEY_ALL, packed);
  await redis.ltrim(KEY_ALL, 0, MAX_LIST_ENTRIES - 1);
  await redis.lpush(agentKey, packed);
  await redis.ltrim(agentKey, 0, MAX_LIST_ENTRIES - 1);
  await bumpTerminalWatermark(redis, 'journal', {
    cycle,
    status: canonEnabled ? 'pending' : 'hot',
    hotCount: 1,
  });

  const outboxItem = canonEnabled
    ? await enqueueJournalCanonWrite(redis, toSubstrateJournalInput(entry, input.gi_at_time))
    : null;

  return { written: true, entry, canonQueued: Boolean(outboxItem) };
}
