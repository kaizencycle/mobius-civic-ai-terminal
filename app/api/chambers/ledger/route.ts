import { NextRequest, NextResponse } from 'next/server';
import { getEchoLedger } from '@/lib/echo/store';
import { currentCycleId } from '@/lib/eve/cycle-engine';
import type { LedgerEntry } from '@/lib/terminal/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type EpiconFeedItem = {
  id?: string;
  cycle?: string;
  cycleId?: string;
  timestamp?: string;
  author?: string;
  title?: string;
  body?: string;
  summary?: string;
  type?: string;
  category?: string;
  status?: string;
  severity?: string;
  source?: string;
  tags?: string[];
  agentOrigin?: string;
  verified?: boolean;
  confidenceTier?: number;
  gi?: number | null;
};

type LedgerProofState = Pick<LedgerEntry, 'status' | 'statusReason' | 'proofSource' | 'canonState'>;

const CYCLE_PATTERN = /\bC-?(\d{1,5})\b/i;

function cleanText(input: unknown): string {
  return typeof input === 'string' ? input.trim() : '';
}

function inferCycleFromText(...inputs: unknown[]): string | null {
  for (const input of inputs) {
    const text = Array.isArray(input) ? input.join(' ') : cleanText(input);
    if (!text) continue;
    const match = text.match(CYCLE_PATTERN);
    if (match?.[1]) return `C-${match[1]}`;
  }
  return null;
}

function normalizeCycle(item: EpiconFeedItem, fallbackCycle: string): string {
  const explicit = cleanText(item.cycle ?? item.cycleId);
  return inferCycleFromText(explicit, item.id, item.title, item.body, item.summary, item.tags, item.source) ?? fallbackCycle;
}

function normalizeTimestamp(input: unknown): string {
  return typeof input === 'string' && input.trim().length > 0 ? input.trim() : new Date().toISOString();
}

function normalizeAgent(item: EpiconFeedItem): string {
  return (item.agentOrigin ?? item.author ?? 'ECHO').trim().toUpperCase();
}

function isMergeEvent(item: EpiconFeedItem): boolean {
  const title = cleanText(item.title).toLowerCase();
  const type = cleanText(item.type).toLowerCase();
  const tags = (item.tags ?? []).map((tag) => tag.toLowerCase());
  return title.startsWith('merge pull request') || type === 'merge' || tags.includes('merge');
}

function isVerifiedSignal(item: EpiconFeedItem): boolean {
  const status = cleanText(item.status).toLowerCase();
  const type = cleanText(item.type).toLowerCase();
  const tags = (item.tags ?? []).map((tag) => tag.toLowerCase());
  return item.verified === true || status === 'verified' || type === 'zeus-verify' || tags.includes('verified');
}

function normalizeProofState(item: EpiconFeedItem): LedgerProofState {
  const status = cleanText(item.status).toLowerCase();
  if (status === 'failed' || status === 'reverted' || status === 'contested') {
    return {
      status: 'reverted',
      statusReason: 'contested_or_reverted_signal',
      proofSource: status || 'feed_status',
      canonState: 'blocked',
    };
  }
  if (isVerifiedSignal(item)) {
    return {
      status: 'committed',
      statusReason: 'explicit_verification_signal',
      proofSource: item.verified === true ? 'epicon_verified' : cleanText(item.type) || 'feed_status',
      canonState: 'attested',
    };
  }
  if (isMergeEvent(item)) {
    return {
      status: 'committed',
      statusReason: 'explicit_merge_event',
      proofSource: 'github_merge',
      canonState: 'candidate',
    };
  }
  if (status === 'committed') {
    return {
      status: 'committed',
      statusReason: 'feed_declared_committed',
      proofSource: 'feed_status',
      canonState: 'candidate',
    };
  }
  return {
    status: 'pending',
    statusReason: 'awaiting_merge_or_verification_evidence',
    proofSource: 'none',
    canonState: 'hot',
  };
}

function normalizeCategory(input: unknown): LedgerEntry['category'] | undefined {
  if (
    input === 'geopolitical' ||
    input === 'market' ||
    input === 'governance' ||
    input === 'infrastructure' ||
    input === 'narrative' ||
    input === 'ethics' ||
    input === 'civic-risk'
  ) {
    return input;
  }
  return undefined;
}

function normalizeSource(input: unknown): LedgerEntry['source'] {
  if (input === 'eve-synthesis' || input === 'agent_commit' || input === 'backfill') return input;
  return 'echo';
}

function epiconToLedgerEntry(item: EpiconFeedItem, idx: number, fallbackCycle: string): LedgerEntry {
  const timestamp = normalizeTimestamp(item.timestamp);
  const proofState = normalizeProofState(item);
  return {
    id: item.id?.trim() || `epicon-feed-${idx}-${timestamp}`,
    cycleId: normalizeCycle(item, fallbackCycle),
    type: 'epicon',
    agentOrigin: normalizeAgent(item),
    timestamp,
    title: item.title,
    summary: item.body ?? item.summary ?? item.title ?? 'EPICON feed event',
    integrityDelta: 0,
    ...proofState,
    category: normalizeCategory(item.category),
    confidenceTier: typeof item.confidenceTier === 'number' ? item.confidenceTier : undefined,
    tags: item.tags,
    source: normalizeSource(item.source),
  };
}

function annotateEchoEntry(entry: LedgerEntry, fallbackCycle: string): LedgerEntry {
  const committed = entry.status === 'committed';
  const reverted = entry.status === 'reverted';
  const inferredCycle = inferCycleFromText(entry.cycleId, entry.id, entry.title, entry.summary, entry.tags, entry.source) ?? fallbackCycle;
  return {
    ...entry,
    cycleId: inferredCycle,
    statusReason: entry.statusReason ?? (reverted ? 'echo_memory_reverted' : committed ? 'echo_memory_committed' : 'echo_memory_pending'),
    proofSource: entry.proofSource ?? 'echo_memory',
    canonState: entry.canonState ?? (reverted ? 'blocked' : committed ? 'candidate' : 'hot'),
  };
}

function dedupeSort(entries: LedgerEntry[]): LedgerEntry[] {
  const seen = new Set<string>();
  return entries
    .filter((entry) => {
      if (seen.has(entry.id)) return false;
      seen.add(entry.id);
      return true;
    })
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

async function fetchEpiconLedgerFallback(request: NextRequest, fallbackCycle: string): Promise<LedgerEntry[]> {
  try {
    const url = new URL('/api/epicon/feed?limit=100&include_catalog=false', request.nextUrl.origin);
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = (await res.json()) as { items?: EpiconFeedItem[] };
    const items = Array.isArray(data.items) ? data.items : [];
    return items.map((item, idx) => epiconToLedgerEntry(item, idx, fallbackCycle));
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  const activeCycle = currentCycleId();
  try {
    const echoEvents = getEchoLedger().map((entry) => annotateEchoEntry(entry, activeCycle));
    const epiconEvents = await fetchEpiconLedgerFallback(request, activeCycle);
    const events = dedupeSort([...echoEvents, ...epiconEvents]).slice(0, 100);
    const pending = events.filter((e) => e.status === 'pending').length;
    const confirmed = events.filter((e) => e.status === 'committed').length;
    const contested = events.filter((e) => e.status === 'reverted').length;
    const missingCycle = events.filter((e) => e.cycleId === 'C-—').length;
    const canon = {
      hot: events.filter((e) => e.canonState === 'hot').length,
      candidate: events.filter((e) => e.canonState === 'candidate').length,
      attested: events.filter((e) => e.canonState === 'attested').length,
      sealed: events.filter((e) => e.canonState === 'sealed').length,
      blocked: events.filter((e) => e.canonState === 'blocked').length,
    };

    return NextResponse.json(
      {
        ok: true,
        cycleId: activeCycle,
        events,
        candidates: { pending, confirmed, contested },
        canon,
        sources: {
          echoMemory: echoEvents.length,
          epiconFeed: epiconEvents.length,
          merged: events.length,
          missingCycle,
        },
        dva: {
          primaryAgent: 'ECHO',
          tier: 't1',
          chambers: ['ledger'],
          promotionGate: 'ZEUS',
        },
        fallback: echoEvents.length === 0 && epiconEvents.length > 0,
        timestamp: new Date().toISOString(),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return NextResponse.json(
      {
        ok: true,
        cycleId: activeCycle,
        events: [],
        candidates: { pending: 0, confirmed: 0, contested: 0 },
        canon: { hot: 0, candidate: 0, attested: 0, sealed: 0, blocked: 0 },
        sources: { echoMemory: 0, epiconFeed: 0, merged: 0, missingCycle: 0 },
        dva: {
          primaryAgent: 'ECHO',
          tier: 't1',
          chambers: ['ledger'],
          promotionGate: 'ZEUS',
        },
        fallback: true,
        timestamp: new Date().toISOString(),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
