import { createHash } from 'node:crypto';
import type { AgentJournalLaneEntry, AgentJournalLaneInput } from '@/lib/agents/journalLane';

export type JournalDedupeMetadata = {
  content_hash: string;
  suppressed_count: number;
  last_seen_at: string;
};

export type JournalDedupeState = {
  hash: string;
  entry_id: string;
  suppressed_count: number;
  last_seen_at: string;
};

export function isJournalDedupeEnabled(): boolean {
  const raw = (process.env.JOURNAL_DEDUPE ?? 'on').trim().toLowerCase();
  return raw !== 'off' && raw !== 'false' && raw !== '0';
}

/** Alert-lane entries are never suppressed regardless of content similarity. */
export function isJournalDedupeExempt(input: Pick<AgentJournalLaneInput, 'category' | 'severity'>): boolean {
  return input.category === 'alert' || input.severity === 'critical';
}

function dedupePayload(input: Pick<
  AgentJournalLaneInput,
  | 'agent'
  | 'cycle'
  | 'scope'
  | 'observation'
  | 'inference'
  | 'recommendation'
  | 'confidence'
  | 'status'
  | 'category'
  | 'severity'
  | 'agentOrigin'
>) {
  return {
    agent: input.agent.trim().toUpperCase(),
    cycle: input.cycle.trim(),
    scope: input.scope.trim(),
    observation: input.observation.trim(),
    inference: input.inference.trim(),
    recommendation: input.recommendation.trim(),
    confidence: Math.round(Math.max(0, Math.min(1, input.confidence)) * 10_000) / 10_000,
    status: input.status,
    category: input.category,
    severity: input.severity,
    agentOrigin: input.agentOrigin.trim().toUpperCase(),
  };
}

export function journalContentHash(input: Pick<
  AgentJournalLaneInput,
  | 'agent'
  | 'cycle'
  | 'scope'
  | 'observation'
  | 'inference'
  | 'recommendation'
  | 'confidence'
  | 'status'
  | 'category'
  | 'severity'
  | 'agentOrigin'
>): string {
  return createHash('sha256').update(JSON.stringify(dedupePayload(input))).digest('hex');
}

export function journalDedupeKey(agent: string, category: string): string {
  return `journal:dedupe:${agent.trim().toLowerCase()}:${category.trim()}`;
}

export function attachDedupeMetadata(
  entry: AgentJournalLaneEntry,
  contentHash: string,
  suppressedCount = 0,
): AgentJournalLaneEntry & { dedupe?: JournalDedupeMetadata } {
  return {
    ...entry,
    dedupe: {
      content_hash: contentHash,
      suppressed_count: suppressedCount,
      last_seen_at: entry.timestamp,
    },
  };
}

export function bumpSuppressedEntry(
  entry: AgentJournalLaneEntry & { dedupe?: JournalDedupeMetadata },
  seenAt: string,
): AgentJournalLaneEntry & { dedupe: JournalDedupeMetadata } {
  const prior = entry.dedupe?.suppressed_count ?? 0;
  const contentHash = entry.dedupe?.content_hash ?? journalContentHash(entry);
  return {
    ...entry,
    dedupe: {
      content_hash: contentHash,
      suppressed_count: prior + 1,
      last_seen_at: seenAt,
    },
  };
}
