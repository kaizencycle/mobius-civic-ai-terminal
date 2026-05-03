import { NextRequest, NextResponse } from 'next/server';
import { GET as getJournal } from '@/app/api/agents/journal/route';
import { chamberSavepointKey, resolveChamberSavepoint } from '@/lib/chambers/savepoint-cache';
import { kvLrange } from '@/lib/kv/store';

export const dynamic = 'force-dynamic';

type DvaTier = 'ALL' | 't1' | 't2' | 't3' | 'sentinel' | 'architects';
type AgentJournalEntry = { agent?: string; agentOrigin?: string; cycle?: string; timestamp?: string };

type RequestedAgentScope = {
  agents: string[];
  explicitAgents: string[];
  conflictingExplicitScope: boolean;
};

type JournalChamberPayload = {
  ok: boolean;
  mode: 'hot' | 'canon' | 'merged';
  entries: unknown[];
  count: number;
  tier: DvaTier;
  tier_agents: string[];
  requested_agents: string[];
  scoped: boolean;
  fallback_reason?: string | null;
  canonical_available: boolean;
  fallback: boolean;
  degraded: boolean;
  timestamp: string;
  [key: string]: unknown;
};

const MAX_READ = 250;
const WINDOW_HOURS_DEFAULT = 48;
const WINDOW_HOURS_MAX = 72;
const KV_JOURNAL_LIST_READ_MAX = 200;
const GENESIS_AGENTS = ['ATLAS', 'ZEUS', 'EVE', 'HERMES', 'AUREA', 'JADE', 'DAEDALUS', 'ECHO'] as const;

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

function resolveRequestedAgents(request: NextRequest, tier: DvaTier): RequestedAgentScope {
  const explicitAgents = Array.from(new Set(request.nextUrl.searchParams.getAll('agent').map(normalizeAgent).filter(Boolean)));

  if (tier === 'ALL') return { agents: explicitAgents, explicitAgents, conflictingExplicitScope: false };

  const tierAgents = DVA_TIER_AGENTS[tier] ?? [];
  if (explicitAgents.length === 0) return { agents: tierAgents, explicitAgents, conflictingExplicitScope: false };

  const allowed = new Set(tierAgents);
  const scopedExplicit = explicitAgents.filter((agent) => allowed.has(agent));
  return { agents: scopedExplicit, explicitAgents, conflictingExplicitScope: scopedExplicit.length === 0 };
}

function entryIsInAgents(entry: unknown, agents: Set<string>): boolean {
  if (agents.size === 0) return true;
  const row = entry as AgentJournalEntry;
  const agent = normalizeAgent(row.agentOrigin ?? row.agent ?? '');
  return agent.length > 0 && agents.has(agent);
}

function entryCycle(entry: unknown): string {
  const row = entry as AgentJournalEntry;
  return typeof row.cycle === 'string' ? row.cycle.trim() : '';
}

function entryTimestamp(entry: unknown): number {
  const row = entry as AgentJournalEntry;
  const ts = typeof row.timestamp === 'string' ? new Date(row.timestamp).getTime() : 0;
  return Number.isFinite(ts) ? ts : 0;
}

function parseMaybeJson(input: unknown): unknown | null {
  if (typeof input !== 'string') return input ?? null;
  try {
    return JSON.parse(input) as unknown;
  } catch {
    return null;
  }
}

async function loadKvHotJournalEntries(args: {
  requestedAgents: string[];
  cycle: string | null;
  windowHours: number;
  limit: number;
}): Promise<unknown[]> {
  const agents = args.requestedAgents.length > 0 ? args.requestedAgents : [...GENESIS_AGENTS];
  const cutoff = Date.now() - args.windowHours * 60 * 60 * 1000;
  const rows = await Promise.all([
    kvLrange<unknown>('journal:all', 0, KV_JOURNAL_LIST_READ_MAX - 1).catch(() => []),
    ...agents.map((agent) => kvLrange<unknown>(`journal:${agent.toLowerCase()}`, 0, KV_JOURNAL_LIST_READ_MAX - 1).catch(() => [])),
    ...agents.map((agent) => kvLrange<unknown>(`agent:${agent.toLowerCase()}:journal`, 0, KV_JOURNAL_LIST_READ_MAX - 1).catch(() => [])),
  ]);

  const seen = new Set<string>();
  const agentSet = new Set(args.requestedAgents);
  return rows
    .flat()
    .map(parseMaybeJson)
    .filter(Boolean)
    .filter((entry) => entryIsInAgents(entry, agentSet))
    .filter((entry) => (args.cycle ? entryCycle(entry) === args.cycle || entryCycle(entry) === '' : true))
    .filter((entry) => {
      const ts = entryTimestamp(entry);
      return ts === 0 || ts >= cutoff;
    })
    .filter((entry) => {
      const row = entry as { id?: unknown };
      const id = typeof row.id === 'string' ? row.id : JSON.stringify(row).slice(0, 120);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .sort((a, b) => entryTimestamp(b) - entryTimestamp(a))
    .slice(0, args.limit);
}

function emptyScopedPayload(mode: string, tier: DvaTier, requestedScope: RequestedAgentScope, reason: string): JournalChamberPayload {
  return {
    ok: true,
    mode: mode as 'hot' | 'canon' | 'merged',
    entries: [],
    count: 0,
    tier,
    tier_agents: requestedScope.agents,
    requested_agents: requestedScope.explicitAgents,
    scoped: tier !== 'ALL',
    canonical_available: false,
    fallback: false,
    degraded: false,
    empty_scope: true,
    empty_scope_reason: reason,
    timestamp: new Date().toISOString(),
  };
}

async function respondWithSavepoint(payload: JournalChamberPayload, scope: Record<string, unknown>, authoritativeReset = false) {
  const key = chamberSavepointKey('journal', scope);
  const resolved = await resolveChamberSavepoint({
    key,
    livePayload: payload,
    liveCount: payload.entries.length,
    authoritativeReset,
    minimumUsefulCount: 1,
  });
  return NextResponse.json(resolved.payload, {
    status: 200,
    headers: { 'Cache-Control': 'public, s-maxage=20, stale-while-revalidate=40' },
  });
}

function clampWindowHours(input: string | null): number {
  const parsed = Number(input ?? String(WINDOW_HOURS_DEFAULT));
  if (!Number.isFinite(parsed) || parsed <= 0) return WINDOW_HOURS_DEFAULT;
  return Math.min(WINDOW_HOURS_MAX, Math.max(1, Math.floor(parsed)));
}

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get('mode') ?? 'merged';
  const limit = clampLimit(request.nextUrl.searchParams.get('limit'));
  const tier = normalizeTier(request.nextUrl.searchParams.get('tier'));
  const requestedScope = resolveRequestedAgents(request, tier);
  const requestedAgents = requestedScope.agents;
  const cycle = request.nextUrl.searchParams.get('cycle');
  const windowHours = clampWindowHours(request.nextUrl.searchParams.get('window_hours'));
  const savepointScope = { mode, limit, tier, agents: requestedAgents.join(','), cycle: cycle ?? '', windowHours };

  if (requestedScope.conflictingExplicitScope) {
    return respondWithSavepoint(
      emptyScopedPayload(mode, tier, requestedScope, 'tier_agent_intersection_empty'),
      savepointScope,
      true,
    );
  }

  const q = new URLSearchParams({ mode, limit: String(limit), window_hours: String(windowHours) });
  for (const agent of requestedAgents) q.append('agent', agent);
  if (cycle) q.set('cycle', cycle);

  const forwarded = new NextRequest(`${request.nextUrl.origin}/api/agents/journal?${q.toString()}`, { headers: request.headers });

  try {
    const res = await getJournal(forwarded);
    const json = (await res.json()) as {
      ok?: boolean;
      entries?: unknown[];
      mode?: 'hot' | 'canon' | 'merged';
      archive_error?: string | null;
      archive_fetched_count?: number;
      sources?: { kv?: number; substrate?: number };
      [key: string]: unknown;
    };
    const agentSet = new Set(requestedAgents);
    let entries = (json.entries ?? []).filter((entry) => entryIsInAgents(entry, agentSet)).slice(0, limit);
    let usedKvFallback = false;

    if (entries.length === 0 && mode !== 'canon') {
      entries = await loadKvHotJournalEntries({ requestedAgents, cycle, windowHours, limit });
      usedKvFallback = entries.length > 0;
    }

    const archiveFetchedCount = typeof json.archive_fetched_count === 'number' ? json.archive_fetched_count : 0;
    const canonicalAvailable = mode === 'hot' ? false : !json.archive_error && archiveFetchedCount > 0;
    const degraded = json.ok === false || !res.ok || Boolean(json.archive_error);
    const fallbackReason = usedKvFallback
      ? 'substrate_empty_or_nested_reader_empty_using_kv_hot'
      : tier !== 'ALL' && entries.length === 0 && !degraded
        ? `No ${tier.toUpperCase()} entries in current window — current cycle cron may not have written yet`
        : null;

    const payload: JournalChamberPayload = {
      ...json,
      ok: json.ok === false ? false : true,
      mode: (usedKvFallback ? 'hot' : json.mode ?? mode) as 'hot' | 'canon' | 'merged',
      entries,
      count: entries.length,
      tier,
      tier_agents: requestedAgents,
      requested_agents: requestedScope.explicitAgents,
      scoped: tier !== 'ALL',
      fallback_reason: fallbackReason,
      canonical_available: canonicalAvailable,
      fallback: degraded || usedKvFallback,
      degraded,
      timestamp: new Date().toISOString(),
      canonical_source: usedKvFallback ? 'kv-hot' : json.canonical_source,
      sources: {
        kv: usedKvFallback ? entries.length : json.sources?.kv ?? 0,
        substrate: json.sources?.substrate ?? archiveFetchedCount,
      },
    };
    return respondWithSavepoint(payload, savepointScope);
  } catch (error) {
    const fallbackEntries = mode !== 'canon'
      ? await loadKvHotJournalEntries({ requestedAgents, cycle, windowHours, limit })
      : [];
    return respondWithSavepoint(
      {
        ok: true,
        degraded: true,
        fallback: true,
        error: error instanceof Error ? error.message : 'journal_chamber_route_failed',
        mode: fallbackEntries.length > 0 ? 'hot' : (mode as 'hot' | 'canon' | 'merged'),
        entries: fallbackEntries,
        count: fallbackEntries.length,
        tier,
        tier_agents: requestedAgents,
        requested_agents: requestedScope.explicitAgents,
        scoped: tier !== 'ALL',
        canonical_available: false,
        canonical_source: fallbackEntries.length > 0 ? 'kv-hot' : 'substrate',
        sources: { kv: fallbackEntries.length, substrate: 0 },
        timestamp: new Date().toISOString(),
      },
      savepointScope,
    );
  }
}
