import { NextRequest, NextResponse } from 'next/server';
import { getServiceAuthError } from '@/lib/security/serviceAuth';
import { appendJournalLaneEntry, getJournalRedisClient } from '@/lib/agents/journalLane';

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
};

const KEY_ALL = 'journal:all';
const MAX_LIST_ENTRIES = 200;
const MAX_READ = 100;
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

function parseEntry(input: unknown): AgentJournalEntry | null {
  const row = asRecord(input);
  if (!row) return null;

  const id = asString(row.id);
  const agent = asString(row.agent).toUpperCase();
  const cycle = asString(row.cycle);
  const timestamp = asString(row.timestamp);
  const scope = asString(row.scope);
  const observation = asString(row.observation);
  const inference = asString(row.inference);
  const recommendation = asString(row.recommendation);
  const status = asString(row.status) as AgentJournalStatus;
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

function buildEntry(input: AgentJournalCreateInput): AgentJournalEntry | null {
  const agent = asString(input.agent).toUpperCase();
  const cycle = asString(input.cycle);
  const observation = asString(input.observation);
  const inference = asString(input.inference);
  const recommendation = asString(input.recommendation);

  if (!agent || !cycle || !observation || !inference || !recommendation) {
    return null;
  }

  const entry: AgentJournalEntry = {
    id: `journal-${agent}-${cycle}-${randomToken(6)}`,
    agent,
    cycle,
    timestamp: new Date().toISOString(),
    scope: asString(input.scope) || 'agent-journal',
    observation,
    inference,
    recommendation,
    confidence: typeof input.confidence === 'number' ? Math.max(0, Math.min(1, input.confidence)) : 0.5,
    derivedFrom: asStringArray(input.derivedFrom),
    status: 'committed',
    category: (['observation', 'inference', 'alert', 'recommendation', 'close'].includes(asString(input.category))
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

async function loadEntries(redis: ReturnType<typeof getJournalRedisClient>): Promise<AgentJournalEntry[]> {
  if (!redis) return [];

  try {
    const rows = await redis.lrange<string[]>(KEY_ALL, 0, MAX_READ - 1);
    const out: AgentJournalEntry[] = [];
    for (const row of rows ?? []) {
      if (typeof row !== 'string') continue;
      try {
        const parsed = parseEntry(JSON.parse(row));
        if (parsed) out.push(parsed);
      } catch {
        continue;
      }
    }
    return out;
  } catch {
    return [];
  }
}

async function seedGenesisEntries(redis: NonNullable<ReturnType<typeof getJournalRedisClient>>, cycle: string): Promise<void> {
  const timestamp = new Date().toISOString();
  for (const agent of GENESIS_AGENTS) {
    const entry: AgentJournalEntry = {
      id: `journal-${agent}-${cycle}-genesis`,
      agent,
      cycle,
      timestamp,
      scope: 'agent-journal',
      observation: `${agent} genesis observation initialized for ${cycle}.`,
      inference: `${agent} baseline reasoning lane is active and ready for live cycle commits.`,
      recommendation: `Continue cycle ${cycle} and replace genesis scaffolding with live entries.`,
      confidence: 0.72,
      derivedFrom: [],
      status: 'committed',
      category: 'observation',
      severity: 'nominal',
      source: 'agent-journal',
      agentOrigin: agent,
      tags: ['genesis', cycle.toLowerCase()],
    };

    const packed = JSON.stringify(entry);
    await redis.lpush(KEY_ALL, packed);
    await redis.ltrim(KEY_ALL, 0, MAX_LIST_ENTRIES - 1);
    await redis.lpush(`journal:${agent.toLowerCase()}`, packed);
    await redis.ltrim(`journal:${agent.toLowerCase()}`, 0, MAX_LIST_ENTRIES - 1);
  }
}

export async function GET(request: NextRequest) {
  const redis = getJournalRedisClient();
  let entries = await loadEntries(redis);

  const { searchParams } = request.nextUrl;
  const agentFilter = asString(searchParams.get('agent')).toUpperCase();
  const cycleFilter = asString(searchParams.get('cycle'));
  const limitRaw = Number(searchParams.get('limit') ?? '20');
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 100) : 20;

  if (entries.length === 0 && redis) {
    await seedGenesisEntries(redis, cycleFilter || 'C-272');
    entries = await loadEntries(redis);
  }

  const filtered = entries
    .filter((entry) => (agentFilter ? entry.agent.toUpperCase() === agentFilter : true))
    .filter((entry) => (cycleFilter ? entry.cycle === cycleFilter : true))
    .slice(0, limit);

  const agents = Array.from(new Set(filtered.map((entry) => entry.agent)));

  return NextResponse.json(
    {
      ok: true,
      count: filtered.length,
      entries: filtered,
      agents,
      timestamp: new Date().toISOString(),
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
  if (authError) return authError;

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
  if (!redis) {
    return NextResponse.json({ ok: false, error: 'Redis not configured' }, { status: 503 });
  }

  const writeResult = await appendJournalLaneEntry(redis, {
    ...entry,
    id: entry.id,
    timestamp: entry.timestamp,
  });

  if (!writeResult.written) {
    return NextResponse.json({ ok: true, duplicate: true, token: writeResult.token });
  }

  return NextResponse.json({ ok: true, entryId: writeResult.entry.id, timestamp: writeResult.entry.timestamp });
}
