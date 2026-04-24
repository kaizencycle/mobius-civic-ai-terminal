import { NextRequest, NextResponse } from 'next/server';
import { GET as getJournal } from '@/app/api/agents/journal/route';

export const dynamic = 'force-dynamic';

type DvaTier = 'ALL' | 't1' | 't2' | 't3' | 'sentinel' | 'architects';
type AgentJournalEntry = { agent?: string; agentOrigin?: string };

const MAX_READ = 100;

const DVA_TIER_AGENTS: Record<Exclude<DvaTier, 'ALL'>, string[]> = {
  t1: ['ECHO'],
  t2: ['ATLAS', 'ZEUS'],
  t3: ['EVE', 'JADE', 'HERMES'],
  sentinel: ['ATLAS', 'ZEUS', 'EVE'],
  architects: ['AUREA', 'DAEDALUS'],
};

function normalizeTier(input: string | null): DvaTier {
  const value = (input ?? '').trim().toLowerCase();
  if (value === 't1' || value === 't2' || value === 't3' || value === 'sentinel' || value === 'architects') {
    return value;
  }
  return 'ALL';
}

function normalizeAgent(input: string): string {
  return input.trim().toUpperCase();
}

function clampLimit(input: string | null): number {
  const parsed = Number(input ?? String(MAX_READ));
  if (!Number.isFinite(parsed) || parsed <= 0) return MAX_READ;
  return Math.min(MAX_READ, Math.max(1, Math.floor(parsed)));
}

function resolveRequestedAgents(request: NextRequest, tier: DvaTier): string[] {
  const explicitAgents = Array.from(
    new Set(request.nextUrl.searchParams.getAll('agent').map(normalizeAgent).filter(Boolean)),
  );
  if (tier === 'ALL') return explicitAgents;

  const tierAgents = DVA_TIER_AGENTS[tier] ?? [];
  if (explicitAgents.length === 0) return tierAgents;

  const allowed = new Set(tierAgents);
  const scopedExplicit = explicitAgents.filter((agent) => allowed.has(agent));
  return scopedExplicit.length > 0 ? scopedExplicit : tierAgents;
}

function entryIsInAgents(entry: unknown, agents: Set<string>): boolean {
  if (agents.size === 0) return true;
  const row = entry as AgentJournalEntry;
  const agent = normalizeAgent(row.agentOrigin ?? row.agent ?? '');
  return agent.length > 0 && agents.has(agent);
}

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get('mode') ?? 'merged';
  const limit = clampLimit(request.nextUrl.searchParams.get('limit'));
  const tier = normalizeTier(request.nextUrl.searchParams.get('tier'));
  const requestedAgents = resolveRequestedAgents(request, tier);
  const cycle = request.nextUrl.searchParams.get('cycle');
  const q = new URLSearchParams({ mode, limit: String(limit) });
  for (const agent of requestedAgents) {
    q.append('agent', agent);
  }
  if (cycle) q.set('cycle', cycle);

  const forwarded = new NextRequest(`${request.nextUrl.origin}/api/agents/journal?${q.toString()}`, {
    headers: request.headers,
  });

  try {
    const res = await getJournal(forwarded);
    const json = (await res.json()) as {
      ok?: boolean;
      entries?: unknown[];
      mode?: 'hot' | 'canon' | 'merged';
      archive_error?: string | null;
      archive_fetched_count?: number;
    };
    const agentSet = new Set(requestedAgents);
    const entries = (json.entries ?? []).filter((entry) => entryIsInAgents(entry, agentSet)).slice(0, limit);
    const archiveFetchedCount = typeof json.archive_fetched_count === 'number' ? json.archive_fetched_count : 0;
    const canonicalAvailable = mode === 'hot' ? false : !json.archive_error && archiveFetchedCount > 0;
    const degraded = json.ok === false || !res.ok || Boolean(json.archive_error);

    return NextResponse.json(
      {
        ...json,
        ok: json.ok === false ? false : true,
        mode: json.mode ?? (mode as 'hot' | 'canon' | 'merged'),
        entries,
        count: entries.length,
        tier,
        tier_agents: requestedAgents,
        scoped: tier !== 'ALL',
        canonical_available: canonicalAvailable,
        fallback: degraded,
        degraded,
        timestamp: new Date().toISOString(),
      },
      {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: true,
        degraded: true,
        fallback: true,
        error: error instanceof Error ? error.message : 'journal_chamber_route_failed',
        mode: mode as 'hot' | 'canon' | 'merged',
        entries: [],
        count: 0,
        tier,
        tier_agents: requestedAgents,
        scoped: tier !== 'ALL',
        canonical_available: false,
        timestamp: new Date().toISOString(),
      },
      {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
}
