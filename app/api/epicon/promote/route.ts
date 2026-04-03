import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { getEchoEpicon, getEchoStatus, pushIngestResult } from '@/lib/echo/store';
import { fetchAllSources } from '@/lib/echo/sources';
import { transformBatch } from '@/lib/echo/transform';
import { pushLedgerEntry } from '@/lib/epicon/ledgerPush';
import { getMemoryLedgerEntries } from '@/lib/epicon/memoryLedgerFeed';
import type { EpiconLedgerFeedEntry } from '@/lib/epicon/ledgerFeedTypes';
import type { EpiconItem } from '@/lib/terminal/types';
import { currentCycleId } from '@/lib/eve/cycle-engine';
import { defaultPromotionState, getPromotionState, savePromotionState } from '@/lib/epicon/promotion';

export const dynamic = 'force-dynamic';

type Agent = 'ZEUS' | 'JADE' | 'HERMES' | 'AUREA' | 'ATLAS';
type PromotionState = Awaited<ReturnType<typeof getPromotionState>>;
type PromotableCategory = EpiconItem['category'];
type ExclusionReason =
  | 'status_not_pending'
  | 'confidence_tier_below_1'
  | 'category_not_promotable'
  | 'already_promoted';

type PromotionTrace = {
  last_promotion_run_at: string | null;
  promoter_input_count: number;
  promoter_eligible_count: number;
  promoter_excluded_reasons: Record<ExclusionReason, number>;
  promoted_ids_this_cycle: string[];
};

const AGENT_ROUTING: Record<EpiconItem['category'], Agent[]> = {
  market: ['HERMES', 'ZEUS', 'AUREA'],
  geopolitical: ['ZEUS', 'AUREA'],
  infrastructure: ['ATLAS', 'ZEUS'],
  narrative: ['AUREA', 'JADE'],
  governance: ['ZEUS', 'JADE', 'AUREA'],
};
const PROMOTABLE_CATEGORIES = new Set<PromotableCategory>([
  'market',
  'infrastructure',
  'geopolitical',
  'governance',
  'narrative',
]);

function getRedisClient(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  try {
    return new Redis({ url, token });
  } catch {
    return null;
  }
}

function severityFromConfidence(confidenceTier: number): EpiconLedgerFeedEntry['severity'] {
  if (confidenceTier >= 3) return 'high';
  if (confidenceTier >= 2) return 'medium';
  return 'low';
}

function parseTimestamp(value: string): number {
  const normalized = value.includes('UTC') ? value.replace(' UTC', 'Z').replace(' ', 'T') : value;
  const ts = new Date(normalized).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function formatCommitTitle(agent: Agent, epicon: EpiconItem): string {
  return `${agent} review: ${epicon.title}`.slice(0, 140);
}

function buildCommit(agent: Agent, epicon: EpiconItem, cycleId: string, seq: number): EpiconLedgerFeedEntry {
  const id = `LE-${cycleId}-${agent}-${String(seq).padStart(3, '0')}`;
  return {
    id,
    timestamp: new Date().toISOString(),
    author: agent,
    title: formatCommitTitle(agent, epicon),
    body: `${agent} committed assessment for ${epicon.id}: ${epicon.summary}`,
    type: 'epicon',
    severity: severityFromConfidence(epicon.confidenceTier),
    tags: ['agent-commit', epicon.category, epicon.id],
    source: 'agent_commit',
    verified: true,
    verifiedBy: 'ZEUS',
    cycle: cycleId,
    category: epicon.category,
    confidenceTier: epicon.confidenceTier,
    derivedFrom: epicon.id,
    status: 'committed',
    agentOrigin: agent,
  };
}

function parsePendingLedgerEntry(row: EpiconLedgerFeedEntry): EpiconItem | null {
  const category = row.category;
  if (!category || !PROMOTABLE_CATEGORIES.has(category as PromotableCategory)) return null;

  const status = row.status ?? (row.verified ? 'committed' : 'pending');
  if (status !== 'pending') return null;

  const confidenceTier =
    typeof row.confidenceTier === 'number' && Number.isInteger(row.confidenceTier) && row.confidenceTier >= 0 && row.confidenceTier <= 4
      ? (row.confidenceTier as EpiconItem['confidenceTier'])
      : 1;

  return {
    id: row.derivedFrom ?? row.id,
    title: row.title,
    category: category as PromotableCategory,
    status: 'pending',
    confidenceTier,
    ownerAgent: row.author || 'ECHO',
    sources: [],
    timestamp: row.timestamp,
    summary: row.body ?? row.title,
    trace: [],
    feedSource: row.source,
  };
}

async function getLedgerPendingEpicon(): Promise<EpiconItem[]> {
  const redis = getRedisClient();
  const rows: EpiconLedgerFeedEntry[] = [];

  if (redis) {
    try {
      const [primary, alias] = await Promise.all([
        redis.lrange<string>('mobius:epicon:feed', 0, 199),
        redis.lrange<string>('epicon:feed', 0, 199),
      ]);

      for (const raw of [...primary, ...alias]) {
        try {
          rows.push(JSON.parse(raw) as EpiconLedgerFeedEntry);
        } catch {
          // ignore malformed rows
        }
      }
    } catch {
      // continue with in-memory fallback
    }
  }

  rows.push(...getMemoryLedgerEntries(200));
  return rows.map(parsePendingLedgerEntry).filter((item): item is EpiconItem => item !== null);
}

async function ensureEchoIngested(): Promise<void> {
  if (getEchoEpicon().length > 0) return;
  try {
    const raw = await fetchAllSources();
    if (raw.length > 0) {
      pushIngestResult(transformBatch(raw));
    }
  } catch {
    // best-effort refresh only
  }
}

async function getPromotablePending(
  state: PromotionState,
  nowIso: string,
  promotedIdsThisCycle: string[] = [],
): Promise<{ pending: EpiconItem[]; trace: PromotionTrace }> {
  await ensureEchoIngested();
  const fromEcho = getEchoEpicon();
  const fromLedger = await getLedgerPendingEpicon();
  const pendingById = new Map<string, EpiconItem>();
  const excluded: Record<ExclusionReason, number> = {
    status_not_pending: 0,
    confidence_tier_below_1: 0,
    category_not_promotable: 0,
    already_promoted: 0,
  };
  const allCandidates = [...fromEcho, ...fromLedger];

  console.info('[epicon/promote] promoter_input_candidates', {
    count: allCandidates.length,
    ids: allCandidates.map((item) => item.id),
  });

  for (const item of allCandidates) {
    if (item.status !== 'pending') {
      excluded.status_not_pending += 1;
      continue;
    }
    if (item.confidenceTier < 1) {
      excluded.confidence_tier_below_1 += 1;
      continue;
    }
    if (!PROMOTABLE_CATEGORIES.has(item.category)) {
      excluded.category_not_promotable += 1;
      continue;
    }
    if (state[item.id]?.promotion_state === 'promoted') {
      excluded.already_promoted += 1;
      continue;
    }
    pendingById.set(item.id, item);
  }

  const pending = [...pendingById.values()]
    .sort((a, b) => {
      if (b.confidenceTier !== a.confidenceTier) return b.confidenceTier - a.confidenceTier;
      return parseTimestamp(b.timestamp) - parseTimestamp(a.timestamp);
    });

  console.info('[epicon/promote] promoter_excluded_reasons', excluded);

  return {
    pending,
    trace: {
      last_promotion_run_at: nowIso,
      promoter_input_count: allCandidates.length,
      promoter_eligible_count: pending.length,
      promoter_excluded_reasons: excluded,
      promoted_ids_this_cycle: promotedIdsThisCycle,
    },
  };
}

async function runPromotionCycle(maxItems: number, nowIso: string, cycleId: string, state: PromotionState) {
  const promotable = await getPromotablePending(state, nowIso);
  const pending = promotable.pending.slice(0, maxItems);
  let promoted = 0;
  let committed = 0;
  let failed = 0;
  let seq = 1;
  const promotedIdsThisCycle: string[] = [];

  for (const epicon of pending) {
    const existing = state[epicon.id] ?? defaultPromotionState(nowIso);
    const assignedAgents = AGENT_ROUTING[epicon.category] ?? ['ZEUS'];

    if (existing.promotion_state === 'promoted' && existing.assigned_agents.length > 0) {
      continue;
    }

    existing.promotion_state = 'selected';
    existing.assigned_agents = assignedAgents;
    existing.last_attempt_at = nowIso;

    try {
      for (const agent of assignedAgents) {
        const alreadyCommitted = existing.committed_entries.some((entryId) => entryId.includes(`-${agent}-`));
        if (alreadyCommitted) continue;

        const commit = buildCommit(agent, epicon, cycleId, seq++);
        await pushLedgerEntry(commit);
        existing.committed_entries.push(commit.id);
        committed += 1;
      }

      existing.promotion_state = 'promoted';
      promoted += 1;
      promotedIdsThisCycle.push(epicon.id);
    } catch {
      existing.promotion_state = 'failed';
      existing.failed_attempts += 1;
      failed += 1;
    }

    state[epicon.id] = existing;
  }

  await savePromotionState(state);
  const postRun = await getPromotablePending(state, nowIso, promotedIdsThisCycle);
  return { pending, promoted, committed, failed, trace: postRun.trace };
}

export async function GET(request: NextRequest) {
  const runCycle = request.nextUrl.searchParams.get('trigger') === '1';
  const maxItems = Number.parseInt(request.nextUrl.searchParams.get('maxItems') ?? '5', 10);
  const boundedMaxItems = Number.isFinite(maxItems) ? Math.min(Math.max(maxItems, 1), 10) : 5;
  const nowIso = new Date().toISOString();
  const cycleId = currentCycleId();
  const state = await getPromotionState();
  let lastRunAt: string | null = null;
  let promotedIdsThisCycle: string[] = [];
  if (runCycle) {
    const run = await runPromotionCycle(boundedMaxItems, nowIso, cycleId, state);
    lastRunAt = nowIso;
    promotedIdsThisCycle = run.trace.promoted_ids_this_cycle;
  }
  const promotable = await getPromotablePending(state, nowIso, promotedIdsThisCycle);
  const pending = promotable.pending;

  let promotedThisCycle = promotedIdsThisCycle.length;
  let committedAgentCount = 0;
  let failedPromotionCount = 0;

  for (const entry of Object.values(state)) {
    committedAgentCount += entry.committed_entries.length;
    failedPromotionCount += entry.failed_attempts;
  }

  return NextResponse.json({
    ok: true,
    cycleId,
    ingest: getEchoStatus(),
    counters: {
      pending_promotable_count: pending.length,
      promoted_this_cycle_count: promotedThisCycle,
      committed_agent_count: committedAgentCount,
      failed_promotion_count: failedPromotionCount,
    },
    diagnostics: {
      ...promotable.trace,
      last_promotion_run_at: lastRunAt,
    },
    items: pending.map((item) => {
      const entry = state[item.id] ?? defaultPromotionState(nowIso);
      return {
        epicon_id: item.id,
        promotion_state: entry.promotion_state,
        assigned_agents: entry.assigned_agents,
        committed_entries: entry.committed_entries,
        failed_attempts: entry.failed_attempts,
      };
    }),
    timestamp: nowIso,
  });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { maxItems?: number };
  const maxItems = typeof body.maxItems === 'number' ? Math.min(Math.max(body.maxItems, 1), 10) : 5;
  const nowIso = new Date().toISOString();
  const cycleId = currentCycleId();
  const state = await getPromotionState();
  const run = await runPromotionCycle(maxItems, nowIso, cycleId, state);

  return NextResponse.json({
    ok: true,
    cycleId,
    processed: run.pending.length,
    promoted: run.promoted,
    committed: run.committed,
    failed: run.failed,
    diagnostics: run.trace,
    maxItems,
    timestamp: nowIso,
  });
}
