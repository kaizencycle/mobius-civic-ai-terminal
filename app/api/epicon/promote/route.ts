import { NextRequest, NextResponse } from 'next/server';
import { getEchoEpicon, getEchoStatus } from '@/lib/echo/store';
import { pushLedgerEntry } from '@/lib/epicon/ledgerPush';
import type { EpiconItem } from '@/lib/terminal/types';
import type { EpiconLedgerFeedEntry } from '@/lib/epicon/ledgerFeedTypes';
import { currentCycleId } from '@/lib/eve/cycle-engine';
import { defaultPromotionState, getPromotionState, savePromotionState } from '@/lib/epicon/promotion';

export const dynamic = 'force-dynamic';

type Agent = 'ZEUS' | 'JADE' | 'HERMES' | 'AUREA' | 'ATLAS';

const AGENT_ROUTING: Record<EpiconItem['category'], Agent[]> = {
  market: ['HERMES', 'ZEUS', 'AUREA'],
  geopolitical: ['ZEUS', 'AUREA', 'ATLAS'],
  infrastructure: ['ATLAS', 'ZEUS'],
  narrative: ['AUREA', 'JADE'],
  governance: ['ZEUS', 'JADE', 'AUREA'],
};

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

function getPromotablePending(maxItems: number): EpiconItem[] {
  return getEchoEpicon()
    .filter((item) => item.status === 'pending')
    .sort((a, b) => {
      if (b.confidenceTier !== a.confidenceTier) return b.confidenceTier - a.confidenceTier;
      return parseTimestamp(b.timestamp) - parseTimestamp(a.timestamp);
    })
    .slice(0, maxItems);
}

export async function GET() {
  const nowIso = new Date().toISOString();
  const cycleId = currentCycleId();
  const pending = getEchoEpicon().filter((item) => item.status === 'pending');
  const state = await getPromotionState();

  let promotedThisCycle = 0;
  let committedAgentCount = 0;
  let failedPromotionCount = 0;

  for (const item of pending) {
    const entry = state[item.id] ?? defaultPromotionState(nowIso);
    committedAgentCount += entry.committed_entries.length;
    if (entry.promotion_state === 'promoted') promotedThisCycle += 1;
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
  const pending = getPromotablePending(maxItems);
  const state = await getPromotionState();

  let promoted = 0;
  let committed = 0;
  let failed = 0;
  let seq = 1;

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
    } catch {
      existing.promotion_state = 'failed';
      existing.failed_attempts += 1;
      failed += 1;
    }

    state[epicon.id] = existing;
  }

  await savePromotionState(state);

  return NextResponse.json({
    ok: true,
    cycleId,
    processed: pending.length,
    promoted,
    committed,
    failed,
    maxItems,
    timestamp: nowIso,
  });
}
