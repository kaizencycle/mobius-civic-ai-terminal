import { NextRequest, NextResponse } from 'next/server';
import { getEchoLedger } from '@/lib/echo/store';
import { currentCycleId } from '@/lib/eve/cycle-engine';
import type { LedgerEntry } from '@/lib/terminal/types';
import { chamberSavepointKey, resolveChamberSavepoint } from '@/lib/chambers/savepoint-cache';

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

type LedgerPayload = {
  ok: true;
  cycleId: string;
  events: LedgerEntry[];
  candidates: { pending: number; confirmed: number; contested: number };
  canon: { hot: number; candidate: number; attested: number; sealed: number; blocked: number };
  pagination: { maxRows: number; pageSize: number; pages: number };
  sources: { echoMemory: number; epiconFeed: number; merged: number; missingCycle: number };
  dva: { primaryAgent: string; tier: string; chambers: string[]; promotionGate: string };
  fallback: boolean;
  timestamp: string;
};

type LedgerProofState = Pick<LedgerEntry, 'status' | 'statusReason' | 'proofSource' | 'canonState'>;

const CYCLE_PATTERN = /\bC-?(\d{1,5})\b/i;
const UNKNOWN_CYCLE = 'C-—';
const LEDGER_MAX_ROWS = 300;
const LEDGER_PAGE_SIZE = 100;
const LEDGER_SCROLL_PAGES = 3;

function cleanText(input: unknown): string {
  return typeof input === 'string' ? input.trim() : '';
}

function safeText(input: unknown): string | undefined {
  const text = cleanText(input);
  return text.length > 0 ? text : undefined;
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

function normalizeCycle(item: EpiconFeedItem): string {
  const explicit = cleanText(item.cycle ?? item.cycleId);
  return inferCycleFromText(explicit, item.id, item.title, item.body, item.summary, item.tags, item.source) ?? UNKNOWN_CYCLE;
}

function normalizeTimestamp(input: unknown): string {
  return typeof input === 'string' && input.trim().length > 0 ? input.trim() : new Date().toISOString();
}

function normalizeAgent(item: EpiconFeedItem): string {
  return safeText(item.agentOrigin ?? item.author)?.toUpperCase() ?? 'ECHO';
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
    return { status: 'reverted', statusReason: 'contested_or_reverted_signal', proofSource: status || 'feed_status', canonState: 'blocked' };
  }
  if (isVerifiedSignal(item)) {
    return { status: 'committed', statusReason: 'explicit_verification_signal', proofSource: item.verified === true ? 'epicon_verified' : cleanText(item.type) || 'feed_status', canonState: 'attested' };
  }
  if (isMergeEvent(item)) {
    return { status: 'committed', statusReason: 'explicit_merge_event', proofSource: 'github_merge', canonState: 'candidate' };
  }
  if (status === 'committed') {
    return { status: 'committed', statusReason: 'feed_declared_committed', proofSource: 'feed_status', canonState: 'candidate' };
  }
  return { status: 'pending', statusReason: 'awaiting_merge_or_verification_evidence', proofSource: 'none', canonState: 'hot' };
}

function normalizeCategory(input: unknown): LedgerEntry['category'] | undefined {
  if (input === 'geopolitical' || input === 'market' || input === 'governance' || input === 'infrastructure' || input === 'narrative' || input === 'ethics' || input === 'civic-risk') return input;
  return undefined;
}

function normalizeSource(input: unknown): LedgerEntry['source'] {
  if (input === 'eve-synthesis' || input === 'agent_commit' || input === 'backfill') return input;
  return 'echo';
}

function epiconToLedgerEntry(item: EpiconFeedItem, idx: number): LedgerEntry {
  const timestamp = normalizeTimestamp(item.timestamp);
  const proofState = normalizeProofState(item);
  return {
    id: safeText(item.id) ?? `epicon-feed-${idx}-${timestamp}`,
    cycleId: normalizeCycle(item),
    type: 'epicon',
    agentOrigin: normalizeAgent(item),
    timestamp,
    title: safeText(item.title),
    summary: safeText(item.body ?? item.summary ?? item.title) ?? 'EPICON feed event',
    integrityDelta: 0,
    ...proofState,
    category: normalizeCategory(item.category),
    confidenceTier: typeof item.confidenceTier === 'number' ? item.confidenceTier : undefined,
    tags: item.tags,
    source: normalizeSource(item.source),
  };
}

function safeEpiconToLedgerEntry(item: EpiconFeedItem, idx: number): LedgerEntry | null {
  try { return epiconToLedgerEntry(item, idx); } catch { return null; }
}

function annotateEchoEntry(entry: LedgerEntry): LedgerEntry {
  const committed = entry.status === 'committed';
  const reverted = entry.status === 'reverted';
  const inferredCycle = inferCycleFromText(entry.cycleId, entry.id, entry.title, entry.summary, entry.tags, entry.source) ?? UNKNOWN_CYCLE;
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
  return entries.filter((entry) => {
    if (seen.has(entry.id)) return false;
    seen.add(entry.id);
    return true;
  }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

async function fetchEpiconPage(request: NextRequest, page: number, limit: number): Promise<EpiconFeedItem[]> {
  const url = new URL('/api/epicon/feed', request.nextUrl.origin);
  url.searchParams.set('page', String(page));
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('include_catalog', 'false');
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return [];
  const data = (await res.json()) as { items?: EpiconFeedItem[] };
  return Array.isArray(data.items) ? data.items : [];
}

async function fetchEpiconLedgerFallback(request: NextRequest): Promise<LedgerEntry[]> {
  const pageResults = await Promise.allSettled(Array.from({ length: LEDGER_SCROLL_PAGES }, (_, page) => fetchEpiconPage(request, page, LEDGER_PAGE_SIZE)));
  return pageResults.flatMap((result) => (result.status === 'fulfilled' ? result.value : [])).map(safeEpiconToLedgerEntry).filter((entry): entry is LedgerEntry => Boolean(entry)).slice(0, LEDGER_MAX_ROWS);
}

function buildPayload(activeCycle: string, echoEvents: LedgerEntry[], epiconEvents: LedgerEntry[]): LedgerPayload {
  const events = dedupeSort([...echoEvents, ...epiconEvents]).slice(0, LEDGER_MAX_ROWS);
  const pending = events.filter((e) => e.status === 'pending').length;
  const confirmed = events.filter((e) => e.status === 'committed').length;
  const contested = events.filter((e) => e.status === 'reverted').length;
  const missingCycle = events.filter((e) => e.cycleId === UNKNOWN_CYCLE).length;
  const canon = {
    hot: events.filter((e) => e.canonState === 'hot').length,
    candidate: events.filter((e) => e.canonState === 'candidate').length,
    attested: events.filter((e) => e.canonState === 'attested').length,
    sealed: events.filter((e) => e.canonState === 'sealed').length,
    blocked: events.filter((e) => e.canonState === 'blocked').length,
  };
  return {
    ok: true,
    cycleId: activeCycle,
    events,
    candidates: { pending, confirmed, contested },
    canon,
    pagination: { maxRows: LEDGER_MAX_ROWS, pageSize: LEDGER_PAGE_SIZE, pages: LEDGER_SCROLL_PAGES },
    sources: { echoMemory: echoEvents.length, epiconFeed: epiconEvents.length, merged: events.length, missingCycle },
    dva: { primaryAgent: 'ECHO', tier: 't1', chambers: ['ledger'], promotionGate: 'ZEUS' },
    fallback: echoEvents.length === 0 && epiconEvents.length > 0,
    timestamp: new Date().toISOString(),
  };
}

async function respondWithSavepoint(payload: LedgerPayload) {
  const savepointKey = chamberSavepointKey('ledger', { scope: 'all', maxRows: LEDGER_MAX_ROWS, pages: LEDGER_SCROLL_PAGES });
  const resolved = await resolveChamberSavepoint({ key: savepointKey, livePayload: payload, liveCount: payload.events.length, minimumUsefulCount: 1 });
  return NextResponse.json(resolved.payload, { headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(request: NextRequest) {
  const activeCycle = currentCycleId();
  try {
    const echoEvents = getEchoLedger().map(annotateEchoEntry);
    const epiconEvents = await fetchEpiconLedgerFallback(request);
    return respondWithSavepoint(buildPayload(activeCycle, echoEvents, epiconEvents));
  } catch {
    return respondWithSavepoint(buildPayload(activeCycle, [], []));
  }
}
