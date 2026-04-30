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
import { checkProvenanceBreak, checkTemporalCoherence } from '@/lib/tripwire/archiveChecks';
import { checkJournalQualityDrift } from '@/lib/tripwire/journalQuality';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type AgentJournalStatus = 'draft' | 'committed' | 'contested' | 'verified';
type AgentJournalCategory = 'observation' | 'inference' | 'alert' | 'recommendation' | 'close';
type AgentJournalSeverity = 'nominal' | 'elevated' | 'critical';
type JournalReadMode = 'hot' | 'canon' | 'merged';

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
  source_mode?: 'kv' | 'substrate';
  canonical_path?: string;
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
const KV_JOURNAL_PER_AGENT_CAP = 50;
const KV_JOURNAL_FAIR_MERGE_MAX = 600;
const KV_JOURNAL_LIST_READ_MAX = 200;
const GENESIS_AGENTS = ['ATLAS', 'ZEUS', 'EVE', 'HERMES', 'AUREA', 'JADE', 'DAEDALUS', 'ECHO'] as const;
const DEFAULT_READ_MODE = ((process.env.JOURNAL_DEFAULT_READ_MODE ?? 'merged').trim().toLowerCase() as JournalReadMode);

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

function normalizeMode(input: string | null): JournalReadMode {
  const raw = asString(input).toLowerCase();
  if (raw === 'hot' || raw === 'canon' || raw === 'merged') return raw;
  if (DEFAULT_READ_MODE === 'hot' || DEFAULT_READ_MODE === 'canon' || DEFAULT_READ_MODE === 'merged') return DEFAULT_READ_MODE;
  return 'merged';
}

function canonicalPathFromTimestamp(agent: string, timestamp: string): string {
  const fileStamp = timestamp.replace(/:/g, '-').replace(/\./g, '-');
  return `journals/${agent.toLowerCase()}/${fileStamp}-journal.json`;
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
    source_mode: 'substrate',
    canonical_path: canonicalPathFromTimestamp(agent, timestamp),
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
    source_mode: 'kv',
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
    source_mode: 'kv',
  };

  return entry;
}

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

function parseJournalStorageKey(key: string): { agent?: string; cycle?: string; kind: 'list' | 'legacy' } | null {
  const normalizedKey = key.startsWith('mobius:') ? key.slice('mobius:'.length) : key;
  const segments = normalizedKey.split(':');
  if (segments[0] !== 'journal') return null;
  if (segments.length === 2 && segments[1] === 'all') return { kind: 'list' };
  if (segments.length === 2 && segments[1]) return { kind: 'list', agent: asString(segments[1]).toUpperCase() };
  if (segments.length === 3 && segments[1] && segments[2]) {
    return { kind: 'legacy', agent: asString(segments[1]).toUpperCase(), cycle: asString(segments[2]) };
  }
  return null;
}

function parseMaybeJson(row: unknown): unknown | null {
  if (typeof row !== 'string') return row ?? null;
  try {
    return JSON.parse(row) as unknown;
  } catch {
    return null;
  }
}

async function readJournalRows(redis: ReturnType<typeof getJournalRedisClient>, key: string, kind: 'list' | 'legacy'): Promise<unknown[]> {
  if (!redis) return [];
  try {
    if (kind === 'list') {
      const rows = await redis.lrange<unknown>(key, 0, KV_JOURNAL_LIST_READ_MAX - 1);
      return Array.isArray(rows) ? rows : [];
    }
    const raw = await redis.get<unknown>(key);
    return Array.isArray(raw) ? raw : [raw];
  } catch {
    return [];
  }
}

async function loadEntries(
  redis: ReturnType<typeof getJournalRedisClient>,
  agentFilters?: string[],
): Promise<AgentJournalEntry[]> {
  if (!redis) return [];

  try {
    const normalized = new Set((agentFilters ?? []).map((agent) => agent.trim().toUpperCase()).filter(Boolean));
    // OPT-3 (C-292): always include journal:all so tier-filtered requests surface entries
    // when per-agent list keys are empty (e.g. before current-cycle cron writes agent keys).
    // Scan both prefixes in parallel — parseJournalStorageKey normalises mobius: keys after
    // discovery, so the mobius:journal:* scan is still required for environments that write
    // under that prefix.
    const agentListKeys = normalized.size > 0
      ? Array.from(normalized).map((agent) => `journal:${agent.toLowerCase()}`)
      : [];
    const allEntriesKey = 'journal:all';
    // OPT-2 (C-293): skip second keys() scan entirely — the reader uses rawGetWithFallback
    // which tries both prefixes per-key anyway. Scanning 'mobius:journal:*' separately
    // doubles round-trips without adding entries the 'journal:*' scan doesn't already catch
    // once parseJournalStorageKey strips the prefix. For envs that write ONLY under mobius:
    // prefix, include it only when the unprefixed scan returns nothing.
    const keysUnprefixed = await redis.keys('journal:*');
    const keysPrefixed = keysUnprefixed.length === 0 ? await redis.keys('mobius:journal:*') : [];
    const keys = [...new Set([allEntriesKey, ...agentListKeys, ...keysUnprefixed, ...keysPrefixed])];
    const seen = new Set<string>();
    const out: AgentJournalEntry[] = [];

    for (const key of keys) {
      const parsedKey = parseJournalStorageKey(key);
      if (!parsedKey) continue;
      if (parsedKey.agent && normalized.size > 0 && !normalized.has(parsedKey.agent)) continue;

      const rows = await readJournalRows(redis, key, parsedKey.kind);
      for (const row of rows) {
        const candidate = parseMaybeJson(row);
        if (!candidate) continue;

        const parsed = parseEntry(candidate, parsedKey.agent, parsedKey.cycle);
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

async function loadSubstrateEntries(agentFilters: string[], limit: number): Promise<{ entries: AgentJournalEntry[]; error: string | null }> {
  const substrateAgents = agentFilters.length > 0 ? agentFilters : [...GENESIS_AGENTS];
  const substrateLimit =
    agentFilters.length === 1
      ? Math.max(3, limit)
      : Math.max(3, Math.ceil(limit / substrateAgents.length));

  const settled = await Promise.allSettled(
    substrateAgents.map((agent) =>
      Promise.race([
        readAgentJournals(agent.toLowerCase(), substrateLimit),
        // OPT-2b (C-293): substrate is consistently empty (totalEntries=0); lower timeout
        // from 5000ms to 2000ms so merged-mode reads don't block on a ghost source.
        new Promise<SubstrateJournalEntry[]>((_, reject) =>
          setTimeout(() => reject(new Error('substrate_timeout')), 2000),
        ),
      ]),
    ),
  );

  const substrateEntries: AgentJournalEntry[] = [];
  let substrateError: string | null = null;

  for (const result of settled) {
    if (result.status === 'fulfilled') {
      for (const row of result.value) {
        const mapped = substrateRecordToAgentEntry(row);
        if (mapped) substrateEntries.push(mapped);
      }
      continue;
    }

    const reason = result.reason instanceof Error ? result.reason.message : result.reason;
    console.error('[journal] substrate fetch failed:', reason);
    if (!substrateError) {
      substrateError = result.reason instanceof Error ? result.reason.message : 'substrate read failed';
    }
  }

  return { entries: substrateEntries, error: substrateError };
}

export async function GET(request: NextRequest) {
  const redis = getJournalRedisClient();

  const { searchParams } = request.nextUrl;
  const mode = normalizeMode(searchParams.get('mode'));
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
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), MAX_READ) : 20;

  const shouldReadKv = mode === 'hot' || mode === 'merged';
  const shouldReadSubstrate = mode === 'canon' || mode === 'merged';

  let kvEntries: AgentJournalEntry[] = shouldReadKv ? await loadEntries(redis, agentFilters) : [];
  if (shouldReadKv && agentFilters.length === 0) {
    kvEntries = mergeKvJournalFair(kvEntries, KV_JOURNAL_PER_AGENT_CAP, KV_JOURNAL_FAIR_MERGE_MAX);
  }

  let substrateEntries: AgentJournalEntry[] = [];
  let substrateError: string | null = null;

  if (shouldReadSubstrate) {
    const substrateResult = await loadSubstrateEntries(agentFilters, limit);
    substrateEntries = substrateResult.entries;
    substrateError = substrateResult.error;
  }

  const kvForSources = agentFilters.length > 0
    ? kvEntries.filter((e) => agentFilterSet.has(e.agentOrigin.toUpperCase()))
    : kvEntries;

  const combined = mode === 'hot' ? kvEntries : mode === 'canon' ? substrateEntries : [...kvEntries, ...substrateEntries];
  const seen = new Set<string>();
  const merged = combined
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
  const journalListCapRaw = Number(process.env.JOURNAL_LIVE_LIST_MAX ?? 1200);
  const journalListCap = Number.isFinite(journalListCapRaw) ? Math.max(200, Math.min(Math.floor(journalListCapRaw), 10_000)) : 1200;
  const [trimCount, trimLastAt] = redis
    ? await Promise.all([
        redis.get<number>('journal:all:trim_count').catch(() => 0),
        redis.get<string>('journal:all:trim_last_at').catch(() => null),
      ])
    : [0, null];

  return NextResponse.json(
    {
      ok: true,
      mode,
      count: filtered.length,
      entries: filtered,
      agents,
      timestamp: new Date().toISOString(),
      sources: {
        kv: kvForSources.length,
        substrate: substrateEntries.length,
      },
      merged_from_archive: mode === 'merged' && substrateEntries.length > 0,
      canonical_source: 'substrate',
      archive_error: substrateError,
      archive_fetched_count: substrateEntries.length,
      archive_stale: archiveStale,
      hot_authoritative: mode === 'hot' || mode === 'merged',
      archive_enriching: mode === 'merged' && (substrateEntries.length > 0 || Boolean(substrateError)),
      journal_window: {
        list_cap: journalListCap,
        trim_count: typeof trimCount === 'number' ? trimCount : 0,
        trim_last_at: typeof trimLastAt === 'string' ? trimLastAt : null,
      },
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

  const candidateEntry: SubstrateJournalEntry = {
    ...entry,
    tags: entry.tags ?? [],
  };

  const provenance = checkProvenanceBreak([candidateEntry]);
  if (provenance.triggered) {
    return NextResponse.json(
      {
        ok: false,
        error: 'provenance_break',
        message: 'PROVENANCE BREAK — trust chain incomplete',
      },
      { status: 422 },
    );
  }

  let recentAgentEntries: SubstrateJournalEntry[] = [];
  try {
    recentAgentEntries = await Promise.race([
      readAgentJournals(entry.agent.toLowerCase(), 5),
      new Promise<SubstrateJournalEntry[]>((_, reject) => setTimeout(() => reject(new Error('journal_read_timeout')), 4000)),
    ]);
  } catch {
    recentAgentEntries = [];
  }
  const temporal = checkTemporalCoherence([candidateEntry, ...recentAgentEntries]);
  if (temporal.triggered) {
    return NextResponse.json(
      {
        ok: false,
        error: 'temporal_break',
        message: 'TEMPORAL BREAK — replay integrity compromised',
      },
      { status: 422 },
    );
  }

  const quality = checkJournalQualityDrift([candidateEntry, ...recentAgentEntries]);
  if (quality.triggered && quality.affectedAgents.includes(entry.agent)) {
    return NextResponse.json(
      {
        ok: false,
        error: 'journal_quality_drift',
        message: 'JOURNAL DRIFT — agent cognition degrading',
      },
      { status: 422 },
    );
  }

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

  const substrateResult = await writeJournalToSubstrate(substratePayload);
  if (!substrateResult.ok) {
    return NextResponse.json(
      {
        ok: false,
        canonical: false,
        error: substrateResult.error ?? 'substrate_write_failed',
        mirrored_to_kv: false,
      },
      { status: 502 },
    );
  }

  let mirroredToKv = false;
  const redis = getJournalRedisClient();
  if (redis) {
    const writeResult = await appendJournalLaneEntry(redis, {
      ...entry,
      id: entry.id,
      timestamp: entry.timestamp,
      canon: false,
      ...(giAt !== undefined ? { gi_at_time: giAt } : {}),
    });
    mirroredToKv = writeResult.written || writeResult.token === 'already_exists';
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

  return NextResponse.json({
    ok: true,
    canonical: true,
    path: substrateResult.path,
    mirrored_to_kv: mirroredToKv,
    entryId: entry.id,
    timestamp: entry.timestamp,
  });
}
