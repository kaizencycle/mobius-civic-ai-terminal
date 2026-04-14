import { NextRequest, NextResponse } from 'next/server';
import { getServiceAuthError } from '@/lib/security/serviceAuth';
import { appendJournalLaneEntry, getJournalRedisClient } from '@/lib/agents/journalLane';
import { writeToSubstrate } from '@/lib/substrate/client';
import { getOperatorSession } from '@/lib/auth/session';
import {
  writeJournalToSubstrate,
  type SubstrateJournalEntry,
  type SubstrateJournalWriteInput,
} from '@/lib/substrate/github-journal';
import { readAgentJournals } from '@/lib/substrate/github-reader';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type AgentJournalStatus = 'draft' | 'committed' | 'contested' | 'verified';
type AgentJournalCategory = 'observation' | 'inference' | 'alert' | 'recommendation' | 'close';
type AgentJournalSeverity = 'nominal' | 'elevated' | 'critical';

interface AgentJournalEntry {
  id: string;
  agent: string;
  cycle: string;
  timestamp: string;
  scope: string;
  observation: string;
  inference: string;
  recommendation: string;
  confidence: number;
  derivedFrom: string[];
  status: AgentJournalStatus;
  category: AgentJournalCategory;
  severity: AgentJournalSeverity;
  source: 'agent-journal';
  agentOrigin: string;
  tags?: string[];
}

type AgentJournalCreateInput = Omit<AgentJournalEntry, 'id' | 'timestamp' | 'status' | 'source'> & {
  id?: string;
  timestamp?: string;
  status?: AgentJournalStatus;
  source?: 'agent-journal';
  type?: string;
  gi_snapshot?: number;
  gi_trend?: number;
  summary?: string;
};

const MAX_READ = 100;
/** When merging all agents from KV, cap per agent so one noisy writer cannot evict others from the global list. */
const KV_JOURNAL_PER_AGENT_CAP = 50;
const KV_JOURNAL_FAIR_MERGE_MAX = 600;
const GENESIS_AGENTS = ['ATLAS', 'ZEUS', 'EVE', 'HERMES', 'AUREA', 'JADE', 'DAEDALUS', 'ECHO'] as const;

function randomToken(length: number): string {
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}


function asRecord(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== 'object') return null;
  return input as Record<string, unknown>;
}

function asString(input: unknown): string {
  return typeof input === 'string' ? input.trim() : '';
}

function asStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map((v) => v.trim());
}

function asOptionalTags(input: unknown): string[] | undefined {
  const tags = asStringArray(input);
  return tags.length > 0 ? tags : undefined;
}

function substrateRecordToAgentEntry(row: SubstrateJournalEntry): AgentJournalEntry | null {
  const id = asString(row.id);
  const agent = asString(row.agent).toUpperCase();
  const cycle = asString(row.cycle);
  const timestamp = asString(row.timestamp);
  const scope = asString(row.scope);
  const observation = asString(row.observation);
  const inference = asString(row.inference);
  const recommendation = asString(row.recommendation);
  const status = (asString(row.status) || 'committed') as AgentJournalStatus;
  const category = asString(row.category) as AgentJournalCategory;
  const severity = asString(row.severity) as AgentJournalSeverity;
  const agentOrigin = asString(row.agentOrigin).toUpperCase();
  const source = row.source;
  const confidence = typeof row.confidence === 'number' ? Math.max(0, Math.min(1, row.confidence)) : Number.NaN;

  if (!id || !agent || !cycle || !timestamp || !scope || !observation || !inference || !recommendation || !agentOrigin) {
    return null;
  }
  if (!['draft', 'committed', 'contested', 'verified'].includes(status)) return null;
  if (!['observation', 'inference', 'alert', 'recommendation', 'close'].includes(category)) return null;
  if (!['nominal', 'elevated', 'critical'].includes(severity)) return null;
  if (source !== 'agent-journal') return null;
  if (Number.isNaN(confidence)) return null;

  return {
    id,
    agent,
    cycle,
    timestamp,
    scope,
    observation,
    inference,
    recommendation,
    confidence,
    derivedFrom: asStringArray(row.derivedFrom),
    status,
    category,
    severity,
    source: 'agent-journal',
    agentOrigin,
    tags: asOptionalTags(row.tags),
  };
}

function parseEntry(input: unknown, fallbackAgent?: string, fallbackCycle?: string): AgentJournalEntry | null {
  const row = asRecord(input);
  if (!row) return null;

  const id = asString(row.id);
  const agent = (asString(row.agent) || asString(fallbackAgent)).toUpperCase();
  const cycle = asString(row.cycle) || asString(fallbackCycle);
  const timestamp = asString(row.timestamp);
  const scope = asString(row.scope) || 'agent-journal';
  const observation = asString(row.observation);
  const inference = asString(row.inference);
  const recommendation = asString(row.recommendation);
  const status = (asString(row.status) || 'committed') as AgentJournalStatus;
  const category = (asString(row.category) || 'observation') as AgentJournalCategory;
  const severity = (asString(row.severity) || 'nominal') as AgentJournalSeverity;
  const agentOrigin = asString(row.agentOrigin).toUpperCase();
  const source = row.source;
  const confidence = typeof row.confidence === 'number' ? Math.max(0, Math.min(1, row.confidence)) : 0.5;

  if (!id || !agent || !cycle || !timestamp || !observation || !inference || !recommendation || !agentOrigin) {
    return null;
  }
  if (!['draft', 'committed', 'contested', 'verified'].includes(status)) return null;
  if (!['observation', 'inference', 'alert', 'recommendation', 'close'].includes(category)) return null;
  if (!['nominal', 'elevated', 'critical'].includes(severity)) return null;
  if (source !== 'agent-journal') return null;

  return {
    id,
    agent,
    cycle,
    timestamp,
    scope,
    observation,
    inference,
    recommendation,
    confidence,
    derivedFrom: asStringArray(row.derivedFrom),
    status,
    category,
    severity,
    source: 'agent-journal',
    agentOrigin,
    tags: asOptionalTags(row.tags),
  };
}

function buildEntry(input: AgentJournalCreateInput): AgentJournalEntry | null {
  const agent = asString(input.agent).toUpperCase();
  const cycle = asString(input.cycle);
  const isDailyClose = asString(input.type).toLowerCase() === 'daily_close';
  const summary = asString(input.summary);
  const trend = typeof input.gi_trend === 'number' ? input.gi_trend : null;
  const giSnapshot = typeof input.gi_snapshot === 'number' ? input.gi_snapshot : null;
  const observation = asString(input.observation) || (isDailyClose ? summary : '');
  const inference = asString(input.inference) || (isDailyClose
    ? `Daily close context — GI snapshot ${giSnapshot?.toFixed(2) ?? 'n/a'}, trend ${trend != null ? trend.toFixed(2) : 'n/a'}.`
    : '');
  const recommendation = asString(input.recommendation) || (isDailyClose
    ? 'Validate scheduler continuity and confirm ledger integration environment variables before next cycle.'
    : '');

  if (!agent || !cycle || !observation || !inference || !recommendation) {
    return null;
  }

  const entry: AgentJournalEntry = {
    id: `journal-${agent}-${cycle}-${randomToken(6)}`,
    agent,
    cycle,
    timestamp: asString(input.timestamp) || new Date().toISOString(),
    scope: asString(input.scope) || 'agent-journal',
    observation,
    inference,
    recommendation,
    confidence: typeof input.confidence === 'number' ? Math.max(0, Math.min(1, input.confidence)) : 0.5,
    derivedFrom: asStringArray(input.derivedFrom),
    status: 'committed',
    category: (isDailyClose
      ? 'close'
      : ['observation', 'inference', 'alert', 'recommendation', 'close'].includes(asString(input.category))
      ? asString(input.category)
      : 'observation') as AgentJournalCategory,
    severity: (['nominal', 'elevated', 'critical'].includes(asString(input.severity))
      ? asString(input.severity)
      : 'nominal') as AgentJournalSeverity,
    source: 'agent-journal',
    agentOrigin: asString(input.agentOrigin).toUpperCase() || agent,
    tags: asOptionalTags(input.tags),
  };

  return entry;
}

/**
 * Resolve logical agent + cycle from Redis key.
 * - Unprefixed: `journal:ZEUS:C-280` (legacy / journal-lane raw client)
 * - Mobius-prefixed: `mobius:journal:ZEUS:C-280` (appendAgentJournalEntry via kvSet)
 */
/**
 * All-agents journal GET used to take only the newest MAX_READ rows globally; frequent EVE (or ZEUS)
 * runs could fill that window and hide ATLAS entirely. Take newest N per agent, then merge.
 */
function mergeKvJournalFair(entries: AgentJournalEntry[], perAgent: number, maxTotal: number): AgentJournalEntry[] {
  const byAgent = new Map<string, AgentJournalEntry[]>();
  for (const e of entries) {
    const k = e.agentOrigin.toUpperCase();
    if (!byAgent.has(k)) byAgent.set(k, []);
    byAgent.get(k)!.push(e);
  }
  for (const arr of byAgent.values()) {
    arr.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }
  const genesisUpper = GENESIS_AGENTS as unknown as readonly string[];
  const extra = [...byAgent.keys()]
    .filter((a) => !genesisUpper.includes(a))
    .sort((x, y) => x.localeCompare(y));
  const orderedAgents = [...GENESIS_AGENTS.map((a) => a as string), ...extra];
  const merged: AgentJournalEntry[] = [];
  for (const agent of orderedAgents) {
    const arr = byAgent.get(agent);
    if (arr) merged.push(...arr.slice(0, perAgent));
  }
  return merged
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, maxTotal);
}

function parseJournalStorageKey(key: string): { agent: string; cycle: string } | null {
  if (key.startsWith('mobius:')) {
    const rest = key.slice('mobius:'.length);
    const segments = rest.split(':');
    if (segments.length !== 3 || segments[0] !== 'journal') return null;
    const keyAgent = asString(segments[1]).toUpperCase();
    const keyCycle = asString(segments[2]);
    if (!keyAgent || !keyCycle) return null;
    return { agent: keyAgent, cycle: keyCycle };
  }
  const segments = key.split(':');
  if (segments.length !== 3 || segments[0] !== 'journal') return null;
  const keyAgent = asString(segments[1]).toUpperCase();
  const keyCycle = asString(segments[2]);
  if (!keyAgent || !keyCycle) return null;
  return { agent: keyAgent, cycle: keyCycle };
}

async function loadEntries(
  redis: ReturnType<typeof getJournalRedisClient>,
  agentFilters?: string[],
): Promise<AgentJournalEntry[]> {
  if (!redis) return [];

  try {
    const normalized = new Set((agentFilters ?? []).map((agent) => agent.trim().toUpperCase()).filter(Boolean));
    const [keysUnprefixed, keysPrefixed] = await Promise.all([
      redis.keys('journal:*'),
      redis.keys('mobius:journal:*'),
    ]);
    const keys = [...new Set([...keysUnprefixed, ...keysPrefixed])];
    const seen = new Set<string>();
    const out: AgentJournalEntry[] = [];

    for (const key of keys) {
      const parsedKey = parseJournalStorageKey(key);
      if (!parsedKey) continue;
      const { agent: keyAgent, cycle: keyCycle } = parsedKey;
      if (normalized.size > 0 && !normalized.has(keyAgent)) continue;

      const raw = await redis.get<unknown>(key);
      const rows = Array.isArray(raw) ? raw : [raw];
      for (const row of rows) {
        const candidate =
          typeof row === 'string'
            ? (() => {
                try {
                  return JSON.parse(row) as unknown;
                } catch {
                  return null;
                }
              })()
            : row;
        if (!candidate) continue;

        const parsed = parseEntry(candidate, keyAgent, keyCycle);
        if (!parsed) continue;
        if (parsed.source !== 'agent-journal') continue;
        if (!asString(parsed.agentOrigin)) continue;
        if (normalized.size > 0 && !normalized.has(parsed.agentOrigin.toUpperCase())) continue;
        if (seen.has(parsed.id)) continue;
        seen.add(parsed.id);
        out.push(parsed);
      }
    }

    return out.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  const redis = getJournalRedisClient();

  const { searchParams } = request.nextUrl;
  const agentFilters = Array.from(
    new Set(
      searchParams
        .getAll('agent')
        .map((agent) => asString(agent).toUpperCase())
        .filter(Boolean),
    ),
  );
  const agentFilterSet = new Set(agentFilters);
  const cycleFilter = asString(searchParams.get('cycle'));
  const limitRaw = Number(searchParams.get('limit') ?? '20');
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 100) : 20;

  let kvEntries = await loadEntries(redis, agentFilters);
  if (agentFilters.length === 0) {
    kvEntries = mergeKvJournalFair(kvEntries, KV_JOURNAL_PER_AGENT_CAP, KV_JOURNAL_FAIR_MERGE_MAX);
  }

  let substrateError: string | null = null;
  let substrateEntries: AgentJournalEntry[] = [];
  const substrateAgents = agentFilters.length > 0 ? agentFilters : [...GENESIS_AGENTS];
  const substrateLimit = agentFilters.length === 1 ? 10 : Math.max(3, Math.ceil(limit / substrateAgents.length));
  for (const agent of substrateAgents) {
    try {
      const substrateRead = readAgentJournals(agent.toLowerCase(), substrateLimit);
      const rows = await Promise.race([
        substrateRead,
        new Promise<SubstrateJournalEntry[]>((_, reject) =>
          setTimeout(() => reject(new Error('substrate_timeout')), 5000),
        ),
      ]);
      for (const row of rows) {
        const mapped = substrateRecordToAgentEntry(row);
        if (mapped) substrateEntries.push(mapped);
      }
    } catch (error) {
      console.error('[journal] substrate fetch failed:', error instanceof Error ? error.message : error);
      if (!substrateError) substrateError = error instanceof Error ? error.message : 'substrate read failed';
    }
  }

  const kvForSources = agentFilters.length > 0
    ? kvEntries.filter((e) => agentFilterSet.has(e.agentOrigin.toUpperCase()))
    : kvEntries;

  const all = [...kvEntries, ...substrateEntries];
  const seen = new Set<string>();
  const merged = all
    .filter((e) => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    })
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const filtered = merged
    .filter((entry) => (agentFilters.length > 0 ? agentFilterSet.has(entry.agentOrigin.toUpperCase()) : true))
    .filter((entry) => (cycleFilter ? entry.cycle === cycleFilter : true))
    .slice(0, limit);

  const agents = Array.from(new Set(filtered.map((entry) => entry.agent)));

  const maxTs = (list: AgentJournalEntry[]) =>
    list.reduce((acc, e) => Math.max(acc, new Date(e.timestamp).getTime() || 0), 0);
  const kvMax = maxTs(kvForSources);
  const subMax = maxTs(substrateEntries);
  const archiveStale =
    substrateEntries.length > 0 && kvMax > 0 && subMax > 0 && kvMax - subMax > 60 * 60 * 1000;

  return NextResponse.json(
    {
      ok: true,
      count: filtered.length,
      entries: filtered,
      agents,
      timestamp: new Date().toISOString(),
      sources: {
        kv: kvForSources.length,
        substrate: substrateEntries.length,
      },
      merged_from_archive: substrateEntries.length > 0,
      archive_error: substrateError,
      archive_fetched_count: substrateEntries.length,
      archive_stale: archiveStale,
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}

export async function POST(request: NextRequest) {
  const authError = getServiceAuthError(request);
  const operator = await getOperatorSession();
  if (authError && !operator) return authError;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const input = asRecord(payload);
  const entry = input ? buildEntry(input as AgentJournalCreateInput) : null;

  if (!entry) {
    return NextResponse.json(
      { ok: false, error: 'Required fields: agent, observation, inference, cycle' },
      { status: 400 },
    );
  }

  const redis = getJournalRedisClient();
  if (redis) {
    const writeResult = await appendJournalLaneEntry(redis, {
      ...entry,
      id: entry.id,
      timestamp: entry.timestamp,
    });

    if (!writeResult.written) {
      return NextResponse.json({ ok: true, duplicate: true, token: writeResult.token, substrate: 'writing' });
    }
    entry.id = writeResult.entry.id;
    entry.timestamp = writeResult.entry.timestamp;
  }

  void writeToSubstrate({
    agent: entry.agent,
    agentOrigin: entry.agentOrigin,
    cycle: entry.cycle,
    title: entry.inference,
    summary: entry.observation,
    category: entry.category,
    severity: entry.severity,
    source: 'agent-journal',
    confidence: entry.confidence,
    derivedFrom: entry.derivedFrom,
    tags: entry.tags,
  }).catch((error) => {
    console.error('[ledger] journal attest error', error);
  });

  const giAt =
    input && typeof input.gi_snapshot === 'number' && Number.isFinite(input.gi_snapshot)
      ? input.gi_snapshot
      : undefined;

  const substratePayload: SubstrateJournalWriteInput = {
    id: entry.id,
    agent: entry.agent,
    agentOrigin: entry.agentOrigin,
    cycle: entry.cycle,
    scope: entry.scope,
    category: entry.category,
    severity: entry.severity,
    observation: entry.observation,
    inference: entry.inference,
    recommendation: entry.recommendation,
    confidence: entry.confidence,
    derivedFrom: entry.derivedFrom,
    source: entry.source,
    tags: entry.tags ?? [],
    ...(giAt !== undefined ? { gi_at_time: giAt } : {}),
    status: entry.status,
  };

  void writeJournalToSubstrate(substratePayload).catch((err) => {
    console.error('[journal] substrate write failed:', err);
  });

  return NextResponse.json({
    ok: true,
    entryId: entry.id,
    timestamp: entry.timestamp,
    substrate: 'writing',
  });
}
