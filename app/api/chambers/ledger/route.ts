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

function normalizeCycle(input: unknown): string {
  return typeof input === 'string' && input.trim().length > 0 ? input.trim() : 'C-—';
}

function normalizeTimestamp(input: unknown): string {
  return typeof input === 'string' && input.trim().length > 0 ? input.trim() : new Date().toISOString();
}

function normalizeAgent(item: EpiconFeedItem): string {
  return (item.agentOrigin ?? item.author ?? 'ECHO').trim().toUpperCase();
}

function normalizeStatus(item: EpiconFeedItem): LedgerEntry['status'] {
  if (item.status === 'committed' || item.verified === true) return 'committed';
  if (item.status === 'failed' || item.status === 'reverted') return 'reverted';
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
    cycleId: normalizeCycle(item.cycle),
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

    return NextResponse.json(
      {
        ok: true,
        events,
        candidates: { pending, confirmed, contested },
        sources: {
          echoMemory: echoEvents.length,
          epiconFeed: epiconEvents.length,
          merged: events.length,
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
        sources: { echoMemory: 0, epiconFeed: 0, merged: 0 },
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
