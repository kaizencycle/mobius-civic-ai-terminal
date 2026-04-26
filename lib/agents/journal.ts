import { kvGet, kvSet } from '@/lib/kv/store';
import { AGENT_MANIFESTS, AGENT_ORDER, type AgentName } from '@/lib/agents/manifests';
import type { AgentJournalCategory, AgentJournalEntry, AgentJournalSeverity, AgentJournalStatus } from '@/lib/terminal/types';
import { scheduleVaultDepositForJournal } from '@/lib/vault/vault';
import { writeToSubstrate } from '@/lib/substrate/client';
import { pushLedgerEntry } from '@/lib/epicon/ledgerPush';
import { setJournalHeartbeat } from '@/lib/runtime/heartbeat';
import { bumpTerminalWatermark } from '@/lib/terminal/watermark';
import { getJournalRedisClient } from '@/lib/agents/journalLane';

const INDEX_KEY = 'journal:index';
const MAX_ENTRIES_PER_AGENT = 100;
const MAX_INDEX_ROWS = 500;

type JournalIndexRow = {
  agent: AgentName;
  cycle: string;
  key: string;
  updatedAt: string;
};

type NewJournalEntryInput = Omit<AgentJournalEntry, 'id' | 'timestamp' | 'scope' | 'source' | 'agentOrigin'> & {
  id?: string;
  timestamp?: string;
  scope?: string;
  source?: 'agent-journal';
  agentOrigin?: string;
};

const VALID_STATUS: AgentJournalStatus[] = ['draft', 'committed', 'contested', 'verified'];
const VALID_CATEGORY: AgentJournalCategory[] = ['observation', 'inference', 'alert', 'recommendation', 'close'];
const VALID_SEVERITY: AgentJournalSeverity[] = ['nominal', 'elevated', 'critical'];

function isAgentName(value: string): value is AgentName {
  return value in AGENT_MANIFESTS;
}

function keyFor(agent: AgentName, cycle: string): string {
  return `journal:${agent}:${cycle}`;
}

function clampConfidence(input: number): number {
  return Math.max(0, Math.min(1, input));
}

function normalizeStringList(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((v) => v.trim());
}

function asRecord(input: unknown): Record<string, unknown> | null {
  if (input === null || typeof input !== 'object') return null;
  return input as Record<string, unknown>;
}

function makeJournalId(agent: AgentName, cycle: string): string {
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 6);
  return `journal-${agent}-${cycle}-${ts}${rnd}`;
}

export function parseAgentJournalEntry(input: unknown): AgentJournalEntry | null {
  const row = asRecord(input);
  if (!row) return null;

  const agent = row.agent;
  const cycle = row.cycle;
  const timestamp = row.timestamp;
  const scope = row.scope;
  const observation = row.observation;
  const inference = row.inference;
  const recommendation = row.recommendation;
  const confidence = row.confidence;
  const status = row.status;
  const category = row.category;
  const severity = row.severity;
  const source = row.source;
  const agentOrigin = row.agentOrigin;
  const id = row.id;

  if (typeof id !== 'string' || !id.trim()) return null;
  if (typeof agent !== 'string' || !isAgentName(agent)) return null;
  if (typeof cycle !== 'string' || !cycle.trim()) return null;
  if (typeof timestamp !== 'string' || !timestamp.trim()) return null;
  if (typeof scope !== 'string' || !scope.trim()) return null;
  if (typeof observation !== 'string' || !observation.trim()) return null;
  if (typeof inference !== 'string' || !inference.trim()) return null;
  if (typeof recommendation !== 'string' || !recommendation.trim()) return null;
  if (typeof confidence !== 'number' || Number.isNaN(confidence)) return null;
  if (typeof status !== 'string' || !VALID_STATUS.includes(status as AgentJournalStatus)) return null;
  if (typeof category !== 'string' || !VALID_CATEGORY.includes(category as AgentJournalCategory)) return null;
  if (typeof severity !== 'string' || !VALID_SEVERITY.includes(severity as AgentJournalSeverity)) return null;
  if (source !== 'agent-journal') return null;
  if (typeof agentOrigin !== 'string' || !isAgentName(agentOrigin)) return null;

  const contestedBy = normalizeStringList(row.contestedBy);
  const verifiedBy = typeof row.verifiedBy === 'string' && row.verifiedBy.trim() ? row.verifiedBy.trim() : undefined;

  return {
    id: id.trim(),
    agent,
    cycle: cycle.trim(),
    timestamp: timestamp.trim(),
    scope: scope.trim(),
    observation: observation.trim(),
    inference: inference.trim(),
    recommendation: recommendation.trim(),
    confidence: clampConfidence(confidence),
    derivedFrom: normalizeStringList(row.derivedFrom),
    relatedAgents: normalizeStringList(row.relatedAgents),
    status: status as AgentJournalStatus,
    contestedBy: contestedBy.length > 0 ? contestedBy : undefined,
    verifiedBy,
    category: category as AgentJournalCategory,
    severity: severity as AgentJournalSeverity,
    source: 'agent-journal',
    agentOrigin,
  };
}

export function buildAgentJournalEntry(input: NewJournalEntryInput): AgentJournalEntry {
  if (!isAgentName(input.agent)) {
    throw new Error(`Unknown agent: ${input.agent}`);
  }
  if (!VALID_STATUS.includes(input.status)) {
    throw new Error(`Invalid status: ${input.status}`);
  }
  if (!VALID_CATEGORY.includes(input.category)) {
    throw new Error(`Invalid category: ${input.category}`);
  }
  if (!VALID_SEVERITY.includes(input.severity)) {
    throw new Error(`Invalid severity: ${input.severity}`);
  }
  const cycle = input.cycle.trim();
  if (!cycle) {
    throw new Error('cycle is required');
  }

  return {
    id: input.id?.trim() || makeJournalId(input.agent, cycle),
    agent: input.agent,
    cycle,
    timestamp: input.timestamp?.trim() || new Date().toISOString(),
    scope: input.scope?.trim() || AGENT_MANIFESTS[input.agent].scope,
    observation: input.observation.trim(),
    inference: input.inference.trim(),
    recommendation: input.recommendation.trim(),
    confidence: clampConfidence(input.confidence),
    derivedFrom: input.derivedFrom,
    relatedAgents: input.relatedAgents,
    status: input.status,
    contestedBy: input.contestedBy,
    verifiedBy: input.verifiedBy,
    category: input.category,
    severity: input.severity,
    source: 'agent-journal',
    agentOrigin: input.agentOrigin?.trim() || input.agent,
  };
}

async function upsertIndex(agent: AgentName, cycle: string): Promise<void> {
  try {
    const key = keyFor(agent, cycle);
    const rows = (await kvGet<JournalIndexRow[]>(INDEX_KEY)) ?? [];
    const existing = rows.filter((row) => !(row.agent === agent && row.cycle === cycle));
    existing.unshift({ agent, cycle, key, updatedAt: new Date().toISOString() });
    await kvSet(INDEX_KEY, existing.slice(0, MAX_INDEX_ROWS));
  } catch (err) {
    console.error(`[journal] index upsert failed for ${agent}:${cycle}:`, err instanceof Error ? err.message : err);
  }
}

export async function appendAgentJournalEntry(input: NewJournalEntryInput): Promise<AgentJournalEntry> {
  setJournalHeartbeat();
  const entry = buildAgentJournalEntry(input);
  const agent = entry.agent as AgentName;
  const key = keyFor(agent, entry.cycle);
  const existing = (await kvGet<AgentJournalEntry[]>(key)) ?? [];
  const next = [...existing, entry].slice(-MAX_ENTRIES_PER_AGENT);
  await kvSet(key, next);
  await upsertIndex(agent, entry.cycle);
  // OPT-8 (C-293): cross-write to journal:all (Writer B list) so ATLAS, ZEUS, EVE
  // appear in snapshot journal_summary.latest_agent_entries. Previously Writer A
  // (kvSet to mobius:journal:AGENT:CYCLE) was invisible to journal_summary which
  // only samples the journal:all Redis list written by appendJournalLaneEntry.
  void (async () => {
    try {
      const { appendJournalLaneEntry } = await import('@/lib/agents/journalLane');
      const redis = getJournalRedisClient();
      if (redis) await appendJournalLaneEntry(redis, entry);
    } catch {
      // non-blocking: if journalLane fails, the primary write already succeeded
    }
  })();
  // C-292: bump watermark so the journal lane reflects Writer A (cron/synthesis)
  // writes, not just Writer B (appendJournalLaneEntry / direct POST). Fire-and-forget
  // so a watermark failure never blocks the journal write itself.
  void bumpTerminalWatermark(getJournalRedisClient(), 'journal', {
    cycle: entry.cycle,
    status: 'hot',
    hotCount: 1,
  }).catch((err) => {
    console.warn('[journal] watermark bump failed (non-blocking):', err instanceof Error ? err.message : err);
  });
  if (entry.status === 'committed') {
    scheduleVaultDepositForJournal(entry);

    void writeToSubstrate({
      agent: entry.agent,
      agentOrigin: entry.agentOrigin,
      cycle: entry.cycle,
      title: entry.inference,
      summary: entry.observation,
      category: mapCategoryToSubstrate(entry.category),
      severity: entry.severity,
      source: 'agent-journal',
      confidence: entry.confidence,
      derivedFrom: entry.derivedFrom,
      tags: [],
    }).catch((err) => {
      console.error(`[journal] ledger attest failed for ${entry.agent}:`, err instanceof Error ? err.message : err);
    });

    void pushLedgerEntry({
      id: entry.id,
      timestamp: entry.timestamp,
      author: entry.agentOrigin,
      title: entry.inference,
      type: 'epicon',
      severity: entry.severity === 'critical' ? 'critical' : entry.severity === 'elevated' ? 'elevated' : 'nominal',
      source: 'agent-journal',
      tags: [entry.agent, entry.category, entry.cycle],
      verified: false,
      category: entry.category,
      status: 'committed',
      agentOrigin: entry.agentOrigin,
    }).catch((err) => {
      console.error(`[journal] pulse ledger push failed for ${entry.agent}:`, err instanceof Error ? err.message : err);
    });
  }
  return entry;
}

function mapCategoryToSubstrate(
  cat: AgentJournalCategory,
): 'observation' | 'inference' | 'alert' | 'recommendation' | 'close' | 'heartbeat' | 'verification' | 'ingest' | 'governance' | 'narrative' | 'market' | 'geopolitical' | 'infrastructure' | 'ethics' | 'civic-risk' {
  return cat;
}

export async function getAgentJournalEntries(filters?: {
  agent?: string | null;
  cycle?: string | null;
  category?: string | null;
  status?: AgentJournalStatus | null;
}): Promise<AgentJournalEntry[]> {
  const agentFilter = typeof filters?.agent === 'string' && filters.agent.trim() ? filters.agent.trim().toUpperCase() : null;
  const cycleFilter = typeof filters?.cycle === 'string' && filters.cycle.trim() ? filters.cycle.trim() : null;
  const categoryFilter = typeof filters?.category === 'string' && filters.category.trim() ? filters.category.trim() : null;
  const statusFilter = filters?.status ?? 'committed';

  const keys = new Set<string>();

  if (agentFilter && cycleFilter && isAgentName(agentFilter)) {
    keys.add(keyFor(agentFilter, cycleFilter));
  } else {
    const rows = (await kvGet<JournalIndexRow[]>(INDEX_KEY)) ?? [];
    for (const row of rows) {
      if (agentFilter && row.agent !== agentFilter) continue;
      if (cycleFilter && row.cycle !== cycleFilter) continue;
      keys.add(row.key);
    }
    if (keys.size === 0 && cycleFilter) {
      for (const agent of AGENT_ORDER) {
        if (agentFilter && agent !== agentFilter) continue;
        keys.add(keyFor(agent, cycleFilter));
      }
    }
  }

  const results = await Promise.all(
    [...keys].map((key) => kvGet<AgentJournalEntry[]>(key)),
  );

  const out: AgentJournalEntry[] = [];
  for (const rows of results) {
    for (const raw of rows ?? []) {
      const entry = parseAgentJournalEntry(raw);
      if (!entry) continue;
      if (statusFilter && entry.status !== statusFilter) continue;
      if (categoryFilter && entry.category !== categoryFilter) continue;
      out.push(entry);
    }
  }

  return out.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}
