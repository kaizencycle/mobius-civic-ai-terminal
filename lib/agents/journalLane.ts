import { Redis } from '@upstash/redis';
import { enqueueJournalCanonWrite } from '@/lib/agents/journalCanonOutbox';
import { bumpTerminalWatermark } from '@/lib/terminal/watermark';
import type { SubstrateJournalWriteInput } from '@/lib/substrate/github-journal';

const KEY_ALL = 'journal:all';
const MAX_LIST_ENTRIES = 200;
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
