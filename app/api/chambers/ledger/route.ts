import { NextRequest, NextResponse } from 'next/server';
import { getEchoLedger } from '@/lib/echo/store';
import type { LedgerEntry } from '@/lib/terminal/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type EpiconFeedItem = {
  id?: string;
  cycle?: string;
  timestamp?: string;
  author?: string;
  title?: string;
  body?: string;
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

const CYCLE_PATTERN = /\bC-?(\d{1,5})\b/i;

function cleanText(input: unknown): string {
  return typeof input === 'string' ? input.trim() : '';
}

function inferCycleFromText(...inputs: unknown[]): string {
  for (const input of inputs) {
    const text = Array.isArray(input) ? input.join(' ') : cleanText(input);
    if (!text) continue;
    const match = text.match(CYCLE_PATTERN);
    if (match?.[1]) return `C-${match[1]}`;
  }
  return 'C-—';
}

function normalizeCycle(item: EpiconFeedItem): string {
  const explicit = cleanText(item.cycle);
  if (explicit) return inferCycleFromText(explicit);
  return inferCycleFromText(item.id, item.title, item.body, item.tags, item.source);
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

function normalizeStatus(item: EpiconFeedItem): LedgerEntry['status'] {
  const status = cleanText(item.status).toLowerCase();
  if (status === 'committed' || status === 'verified' || item.verified === true || isMergeEvent(item)) {
    return 'committed';
  }
  if (status === 'failed' || status === 'reverted' || status === 'contested') return 'reverted';
  return 'pending';
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

function epiconToLedgerEntry(item: EpiconFeedItem, idx: number): LedgerEntry {
  const timestamp = normalizeTimestamp(item.timestamp);
  return {
    id: item.id?.trim() || `epicon-feed-${idx}-${timestamp}`,
    cycleId: normalizeCycle(item),
    type: 'epicon',
    agentOrigin: normalizeAgent(item),
    timestamp,
    title: item.title,
    summary: item.body ?? item.title ?? 'EPICON feed event',
    integrityDelta: 0,
    status: normalizeStatus(item),
    category: normalizeCategory(item.category),
    confidenceTier: typeof item.confidenceTier === 'number' ? item.confidenceTier : undefined,
    tags: item.tags,
    source: normalizeSource(item.source),
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

async function fetchEpiconLedgerFallback(request: NextRequest): Promise<LedgerEntry[]> {
  try {
    const url = new URL('/api/epicon/feed?limit=100&include_catalog=false', request.nextUrl.origin);
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = (await res.json()) as { items?: EpiconFeedItem[] };
    const items = Array.isArray(data.items) ? data.items : [];
    return items.map(epiconToLedgerEntry);
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  try {
    const echoEvents = getEchoLedger();
    const epiconEvents = await fetchEpiconLedgerFallback(request);
    const events = dedupeSort([...echoEvents, ...epiconEvents]).slice(0, 100);
    const pending = events.filter((e) => e.status === 'pending').length;
    const confirmed = events.filter((e) => e.status === 'committed').length;
    const contested = events.filter((e) => e.status === 'reverted').length;
    const missingCycle = events.filter((e) => e.cycleId === 'C-—').length;

    return NextResponse.json(
      {
        ok: true,
        events,
        candidates: { pending, confirmed, contested },
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
        events: [],
        candidates: { pending: 0, confirmed: 0, contested: 0 },
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
