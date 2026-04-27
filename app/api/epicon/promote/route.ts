import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { getEchoEpicon, getEchoIntegrity, getEchoStatus, pushIngestResult } from '@/lib/echo/store';
import { fetchAllSources } from '@/lib/echo/sources';
import { transformBatch } from '@/lib/echo/transform';
import { pushLedgerEntry } from '@/lib/epicon/ledgerPush';
import { getMemoryLedgerEntries } from '@/lib/epicon/memoryLedgerFeed';
import type { EpiconLedgerFeedEntry } from '@/lib/epicon/ledgerFeedTypes';
import type { EpiconItem } from '@/lib/terminal/types';
import { currentCycleId } from '@/lib/eve/cycle-engine';
import {
  defaultPromotionState,
  getPromotionState,
  savePromotionState,
  incrementStallCounter,
  resetStallCounter,
} from '@/lib/epicon/promotion';
import { appendJournalLaneEntry, getJournalRedisClient } from '@/lib/agents/journalLane';
import { getAgentBearerToken, writeToSubstrate } from '@/lib/substrate/client';

export const dynamic = 'force-dynamic';

type Agent = 'ZEUS' | 'JADE' | 'HERMES' | 'AUREA' | 'ATLAS';
type PromotionState = Awaited<ReturnType<typeof getPromotionState>>;
type PromotableCategory = EpiconItem['category'];
type ExclusionReason =
  | 'status_not_promotable'
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
  ethics: ['ZEUS', 'AUREA', 'JADE'],
  'civic-risk': ['ZEUS', 'AUREA', 'HERMES'],
};
const PROMOTABLE_CATEGORIES = new Set<PromotableCategory>([
  'market',
  'infrastructure',
  'geopolitical',
  'governance',
  'narrative',
]);

function getRedisClient(): Redis | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
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

function toIdToken(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toUpperCase();
}

function buildCommit(agent: Agent, epicon: EpiconItem, cycleId: string, seq: number): EpiconLedgerFeedEntry {
  const stamp = Date.now();
  const derivedFromToken = toIdToken(epicon.id);
  const id = `LE-${cycleId}-${agent}-${derivedFromToken}-${stamp}-${String(seq).padStart(3, '0')}`;
  const attestation = epicon.echoIngest?.metadata?.integrityAttestation as
    | { verdict?: string; mii?: number; ratings?: unknown[] }
    | undefined;
  const derivedFromIds = [
    epicon.id,
    ...(attestation ? [`echo-integrity:${epicon.id}`] : []),
  ];
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
    derivedFromIds,
    status: 'committed',
    agentOrigin: agent,
  };
}


function toJournalSeverity(level: EpiconLedgerFeedEntry['severity']): 'nominal' | 'elevated' | 'critical' {
  if (level === 'high') return 'critical';
  if (level === 'medium') return 'elevated';
  return 'nominal';
}

async function writeCommitJournalEntry(commit: EpiconLedgerFeedEntry, epicon: EpiconItem): Promise<void> {
  const redis = getJournalRedisClient();
  if (!redis) return;

  const agent = (commit.agentOrigin || commit.author || 'ZEUS').toUpperCase();
  const cycle = commit.cycle || currentCycleId();
  const derived = [commit.derivedFrom || epicon.id];

  await appendJournalLaneEntry(redis, {
    agent,
    cycle,
    scope: `${agent} reasoning lane`,
    observation: `${agent} committed ${epicon.id} (${epicon.category}) at confidence tier ${epicon.confidenceTier}.`,
    inference: `${agent} judged the event suitable for ledger-level publication in ${cycle}.`,
    recommendation: `Track downstream corroboration and GI impact for ${epicon.id}.`,
    confidence: Math.max(0.5, Math.min(0.96, 0.55 + epicon.confidenceTier * 0.1)),
    derivedFrom: derived,
    status: 'committed',
    category: 'observation',
    severity: toJournalSeverity(commit.severity),
    agentOrigin: agent,
    tags: ['agent-commit', epicon.category, epicon.id],
  });
}

function parsePendingLedgerEntry(row: EpiconLedgerFeedEntry): EpiconItem | null {
  const category = row.category;
  if (!category || !PROMOTABLE_CATEGORIES.has(category as PromotableCategory)) return null;

  if (row.source === 'agent_commit') return null;

  let epiconLane: EpiconItem['status'] =
    row.epiconStatus ??
    (row.source === 'kv-ledger' ? (row.verified ? 'verified' : 'pending') : 'pending');

  if (epiconLane === 'contradicted') return null;

  const ledgerRowStatus = row.status;
  if (ledgerRowStatus === 'committed') return null;

  if (epiconLane !== 'verified' && epiconLane !== 'pending') return null;

  const confidenceTier =
    typeof row.confidenceTier === 'number' && Number.isInteger(row.confidenceTier) && row.confidenceTier >= 0 && row.confidenceTier <= 4
      ? (row.confidenceTier as EpiconItem['confidenceTier'])
      : 1;

  const id = row.derivedFrom ?? row.id;
  const attestation = (row as EpiconLedgerFeedEntry & { integrityAttestation?: unknown }).integrityAttestation;

  return {
    id,
    title: row.title,
    category: category as PromotableCategory,
    status: epiconLane,
    confidenceTier,
    ownerAgent: row.author || 'ECHO',
    sources: Array.isArray(row.tags) ? row.tags : [],
    timestamp: row.timestamp,
    summary: row.body ?? row.title,
    trace: [],
    feedSource: row.source,
    echoIngest:
      attestation && typeof attestation === 'object'
        ? {
            source: 'ECHO',
            severity: 'low',
            metadata: { integrityAttestation: attestation },
          }
        : undefined,
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

async function getLedgerRows(limit = 400): Promise<EpiconLedgerFeedEntry[]> {
  const redis = getRedisClient();
  const rows: EpiconLedgerFeedEntry[] = [];

  if (redis) {
    try {
      const [primary, alias] = await Promise.all([
        redis.lrange<string>('mobius:epicon:feed', 0, limit - 1),
        redis.lrange<string>('epicon:feed', 0, limit - 1),
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

  rows.push(...getMemoryLedgerEntries(limit));
  return rows;
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
  const fromLedger = await getLedgerPendingEpicon();
  const pendingById = new Map<string, EpiconItem>();
  const excluded: Record<ExclusionReason, number> = {
    status_not_promotable: 0,
    confidence_tier_below_1: 0,
    category_not_promotable: 0,
    already_promoted: 0,
  };
  const integrity = getEchoIntegrity();
  const fromEcho = getEchoEpicon().map((item) => {
    const rating = integrity?.ratings.find((r) => r.eventId === item.id);
    if (!rating) return item;
    return {
      ...item,
      echoIngest: {
        ...item.echoIngest,
        source: item.echoIngest?.source ?? 'ECHO',
        severity: item.echoIngest?.severity ?? 'low',
        metadata: {
          ...item.echoIngest?.metadata,
          integrityAttestation: rating,
        },
      },
    };
  });

  // Merge by id: ledger rows (often stale shape) + echo in-memory (verified, category, attestation).
  const mergedById = new Map<string, EpiconItem>();
  for (const item of fromLedger) mergedById.set(item.id, item);
  for (const item of fromEcho) {
    const cur = mergedById.get(item.id);
    if (!cur) {
      mergedById.set(item.id, item);
      continue;
    }
    mergedById.set(item.id, {
      ...cur,
      ...item,
      echoIngest: item.echoIngest ?? cur.echoIngest,
      status: cur.status === 'verified' || item.status === 'verified' ? 'verified' : item.status,
      confidenceTier:
        typeof item.confidenceTier === 'number' && item.confidenceTier >= 0 ? item.confidenceTier : cur.confidenceTier,
      category: item.category ?? cur.category,
      summary: item.summary?.trim() ? item.summary : cur.summary,
      title: item.title?.trim() ? item.title : cur.title,
    });
  }
  const allCandidates = [...mergedById.values()];

  console.info('[epicon/promote] promoter_input_candidates', {
    count: allCandidates.length,
    ids: allCandidates.map((item) => item.id),
  });

  for (const item of allCandidates) {
    if (item.status !== 'pending' && item.status !== 'verified') {
      excluded.status_not_promotable += 1;
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
    const existingState = state[item.id];
    if (existingState?.promotion_state === 'promoted') {
      const promotedAt = existingState.promoted_at ? new Date(existingState.promoted_at).getTime() : 0;
      const ageMs = Date.now() - promotedAt;
      if (ageMs < RECHECK_WINDOW_MS || !promotedAt) {
        // Recently promoted (within 6h) — hard block
        excluded.already_promoted += 1;
        continue;
      }
      // Promoted >6h ago — allow re-entry as confirmation; will be treated as a re-check
      item.promotionState = 'selected';
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

// Stall threshold — 3 consecutive zero-promotion runs triggers a critical journal entry
const STALL_THRESHOLD = 3;
// Re-entry window — items promoted more than 6h ago may re-enter as a confirmation pass
const RECHECK_WINDOW_MS = 6 * 60 * 60 * 1000;

async function writeStallJournalEntry(
  cycleId: string,
  stallCount: number,
  excluded: Record<string, number>,
): Promise<void> {
  const redis = getJournalRedisClient();
  if (!redis) return;
  await appendJournalLaneEntry(redis, {
    agent: 'ATLAS',
    cycle: cycleId,
    scope: 'epicon-promotion-health',
    observation: `EPICON promotion lane stalled for ${stallCount} consecutive runs in ${cycleId}.`,
    inference: `All ${excluded.already_promoted ?? 0} input items are pre-blocked by dedup. No new EPICONs are reaching the ledger. Feed is frozen.`,
    recommendation:
      'Inspect epicon:promotion:state KV key. Verify new items are ingested with distinct IDs. Call /api/admin/epicon-dedup-reset to unblock if needed.',
    confidence: 0.95,
    derivedFrom: [],
    status: 'committed',
    category: 'alert',
    severity: 'critical',
    agentOrigin: 'ATLAS',
    tags: ['epicon', 'stall', 'promotion', cycleId],
  });
}

async function runPromotionCycle(maxItems: number, nowIso: string, cycleId: string, state: PromotionState) {
  const promotable = await getPromotablePending(state, nowIso);
  const pending = promotable.pending.slice(0, maxItems);
  let promoted = 0;
  let committed = 0;
  let failed = 0;
  let failedCommits = 0;
  let seq = 1;
  const promotedIdsThisCycle: string[] = [];

  const agentToken = getAgentBearerToken();
  const ledgerReady = agentToken.length > 0;
  if (!ledgerReady) {
    console.error(
      '[promoter] AGENT_SERVICE_TOKEN (or RENDER_API_KEY) missing — skipping ledger push and substrate attest; set token in Vercel to enable commits',
    );
  }

  for (const epicon of pending) {
    const existing = state[epicon.id] ?? defaultPromotionState(nowIso);
    const assignedAgents = AGENT_ROUTING[epicon.category] ?? ['ZEUS'];

    if (existing.promotion_state === 'promoted' && existing.assigned_agents.length > 0) {
      // Items flagged for recheck by the re-entry window (promotionState === 'selected')
      // are allowed through — they were promoted >6h ago and need a confirmation pass.
      if (epicon.promotionState !== 'selected') continue;
    }

    const attestation = epicon.echoIngest?.metadata?.integrityAttestation as
      | { mii?: number; verdict?: string }
      | undefined;
    const eventMii = attestation?.mii ?? 0;
    const autoVerify = epicon.confidenceTier >= 1 && eventMii >= 0.90;
    if (autoVerify && epicon.status === 'pending') {
      epicon.status = 'verified';
    }

    existing.promotion_state = 'selected';
    existing.assigned_agents = assignedAgents;
    existing.last_attempt_at = nowIso;

    let anyCommitSucceeded = false;

    try {
      // fast-path: verified items always commit (pushLedgerEntry uses KV, not external token)
      if (epicon.status === 'verified') {
        const primary: Agent = (AGENT_ROUTING[epicon.category] ?? ['ZEUS'])[0] ?? 'ZEUS';
        try {
          const commit = buildCommit(primary, epicon, cycleId, seq++);
          console.info('[promoter] verified fast-path commit for', epicon.id, 'agent', primary);
          await pushLedgerEntry(commit);
          await writeCommitJournalEntry(commit, epicon);
          void writeToSubstrate({
            id: commit.id,
            timestamp: commit.timestamp,
            agent: primary,
            agentOrigin: primary,
            cycle: cycleId,
            title: commit.title,
            summary: commit.body ?? commit.title,
            category: 'observation',
            severity: commit.severity === 'high' ? 'critical' : commit.severity === 'medium' ? 'elevated' : 'nominal',
            source: 'epicon-promotion',
            confidence: Math.max(0.5, Math.min(0.98, 0.55 + epicon.confidenceTier * 0.1)),
            derivedFrom: [epicon.id],
            tags: ['agent-commit', epicon.category, epicon.id, 'verified-fast-path'],
            verified: true,
          }).catch((error) => {
            console.error('[ledger] promotion attest error', { commitId: commit.id, error });
          });
          existing.committed_entries.push(commit.id);
          committed += 1;
          anyCommitSucceeded = true;
        } catch (err) {
          console.error('[promoter] verified fast-path failed', epicon.id, err);
          failedCommits += 1;
        }
      } else {
      for (const agent of assignedAgents) {
        const alreadyCommitted = existing.committed_entries.some((entryId) => entryId.includes(`-${agent}-`));
        if (alreadyCommitted) continue;

        const commit = buildCommit(agent, epicon, cycleId, seq++);
        try {
          console.info('[promoter] attempting commit for', epicon.id, 'agent', agent);
          // pushLedgerEntry writes to KV/Redis directly — no external token required
          await pushLedgerEntry(commit);
          await writeCommitJournalEntry(commit, epicon);
          void writeToSubstrate({
            id: commit.id,
            timestamp: commit.timestamp,
            agent,
            agentOrigin: agent,
            cycle: cycleId,
            title: commit.title,
            summary: commit.body ?? commit.title,
            category: 'observation',
            severity: commit.severity === 'high' ? 'critical' : commit.severity === 'medium' ? 'elevated' : 'nominal',
            source: 'epicon-promotion',
            confidence: Math.max(0.5, Math.min(0.98, 0.55 + epicon.confidenceTier * 0.1)),
            derivedFrom: [epicon.id],
            tags: ['agent-commit', epicon.category, epicon.id],
            verified: true,
          }).catch((error) => {
            console.error('[ledger] promotion attest error', { commitId: commit.id, error });
          });
          existing.committed_entries.push(commit.id);
          committed += 1;
          anyCommitSucceeded = true;
        } catch (err) {
          console.error('[promoter] failed to commit', epicon.id, err);
          failedCommits += 1;
        }
      }
      }
      const allAgentsSatisfied = assignedAgents.every((agent) =>
        existing.committed_entries.some((entryId) => entryId.includes(`-${agent}-`)),
      );

      if (anyCommitSucceeded || allAgentsSatisfied) {
        existing.promotion_state = 'promoted';
        existing.promoted_at = nowIso;
        promoted += 1;
        promotedIdsThisCycle.push(epicon.id);
      } else {
        existing.promotion_state = ledgerReady ? 'failed' : 'pending';
        existing.failed_attempts += 1;
        failed += 1;
      }
    } catch {
      existing.promotion_state = 'failed';
      existing.failed_attempts += 1;
      failed += 1;
    }

    state[epicon.id] = existing;
  }

  await savePromotionState(state, cycleId);

  // Stall detection — track consecutive runs where nothing was promoted
  if (promoted === 0 && pending.length > 0) {
    const stallCount = await incrementStallCounter(cycleId);
    if (stallCount >= STALL_THRESHOLD) {
      console.error(
        `[epicon/promote] PROMOTION_LANE_STALL: ${stallCount} consecutive zero-promotion runs in ${cycleId}. ` +
        `Input: ${pending.length}. Excluded: ${JSON.stringify(promotable.trace.promoter_excluded_reasons)}`,
      );
      await writeStallJournalEntry(cycleId, stallCount, promotable.trace.promoter_excluded_reasons);
    }
  } else if (promoted > 0) {
    await resetStallCounter(cycleId);
  }

  const postRun = await getPromotablePending(state, nowIso, promotedIdsThisCycle);
  return { pending, promoted, committed, failed, failedCommits, trace: postRun.trace };
}

export async function GET() {
  const nowIso = new Date().toISOString();
  const cycleId = currentCycleId();
  const state = await getPromotionState(cycleId);
  const promotable = await getPromotablePending(state, nowIso);
  const pending = promotable.pending;

  let promotedThisCycle = 0;
  let committedAgentCount = 0;
  let failedPromotionCount = 0;
  const cyclePrefix = `LE-${cycleId}-`;

  for (const entry of Object.values(state)) {
    const committedInActiveCycle = entry.committed_entries.filter((entryId) => entryId.startsWith(cyclePrefix));
    committedAgentCount += committedInActiveCycle.length;
    if (entry.promotion_state === 'promoted' && committedInActiveCycle.length > 0) {
      promotedThisCycle += 1;
    }
    failedPromotionCount += entry.failed_attempts;
  }

  const ledgerRows = await getLedgerRows();
  const seenCommittedIds = new Set<string>();
  for (const row of ledgerRows) {
    if (row.source !== 'agent_commit' || row.status !== 'committed' || row.cycle !== cycleId) continue;
    if (typeof row.id !== 'string' || !row.id) continue;
    seenCommittedIds.add(row.id);
  }
  committedAgentCount = seenCommittedIds.size;

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
      last_promotion_run_at: promotable.trace.last_promotion_run_at,
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
  const maxItems = typeof body.maxItems === 'number' ? Math.min(Math.max(body.maxItems, 1), 50) : 25;
  const nowIso = new Date().toISOString();
  const cycleId = currentCycleId();
  const state = await getPromotionState(cycleId);
  const run = await runPromotionCycle(maxItems, nowIso, cycleId, state);
  const tokenPresent = Boolean(process.env.AGENT_SERVICE_TOKEN?.trim() || process.env.RENDER_API_KEY?.trim());
  if (!tokenPresent) {
    console.error('[promoter] AGENT_SERVICE_TOKEN missing; substrate promotion attest may fail');
  }

  return NextResponse.json({
    ok: true,
    cycleId,
    processed: run.pending.length,
    promoted: run.promoted,
    committed: run.committed,
    failed: run.failed,
    failedCommits: run.failedCommits,
    tokenPresent,
    diagnostics: run.trace,
    maxItems,
    timestamp: nowIso,
  });
}
