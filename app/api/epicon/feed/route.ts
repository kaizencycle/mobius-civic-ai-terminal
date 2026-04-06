import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { getPublicEpiconFeed } from '@/lib/epicon/feedStore';
import { getMemoryLedgerEntries } from '@/lib/epicon/memoryLedgerFeed';
import type { EpiconLedgerFeedEntry } from '@/lib/epicon/ledgerFeedTypes';

export const dynamic = 'force-dynamic';

type EpiconType = 'heartbeat' | 'catalog' | 'zeus-verify' | 'zeus-report' | 'epicon' | 'merge' | 'unknown';
type EpiconSeverity =
  | 'nominal'
  | 'degraded'
  | 'elevated'
  | 'critical'
  | 'info'
  | 'low'
  | 'medium'
  | 'high';
type EpiconSource =
  | 'github-commit'
  | 'kv-ledger'
  | 'memory-feed'
  | 'backfill'
  | 'eve-synthesis'
  | 'agent_commit'
  | 'ledger-api';

type EpiconEntry = {
  id: string;
  cycle?: string;
  timestamp: string;
  author: string;
  title: string;
  body?: string;
  type: EpiconType;
  severity: EpiconSeverity;
  gi?: number | null;
  anomalies?: string[];
  sha?: string;
  source: EpiconSource;
  tags: string[];
  verified: boolean;
  verifiedBy?: string;
  category?: string;
  confidenceTier?: number;
  zeusVerdict?: string;
  patternType?: string;
  dominantRegion?: string;
  derivedFrom?: string;
  derivedFromIds?: string[];
  status?: 'committed' | 'pending' | 'failed';
  agentOrigin?: string;
  promotion_state?: 'pending' | 'selected' | 'promoted' | 'failed';
  assigned_agents?: string[];
  committed_entries?: string[];
};

type GitHubCommit = {
  sha: string;
  commit: {
    message: string;
    author: {
      name: string;
      email: string;
      date: string;
    };
  };
};

function getRedisClient(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  try {
    return new Redis({ url, token });
  } catch {
    return null;
  }
}

async function fetchGitHubCommits(limit = 80): Promise<GitHubCommit[]> {
  const url = `https://api.github.com/repos/kaizencycle/mobius-civic-ai-terminal/commits?per_page=${limit}&sha=main`;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const res = await fetch(url, { headers, next: { revalidate: 120 } });
  if (!res.ok) {
    return [];
  }

  const data: unknown = await res.json();
  return Array.isArray(data) ? (data as GitHubCommit[]) : [];
}

function parseHeartbeat(message: string): Partial<EpiconEntry> | null {
  const base = /^heartbeat:\s*(nominal|degraded|elevated|critical)/i.exec(message);
  if (!base) return null;

  const state = base[1].toLowerCase() as Exclude<EpiconSeverity, 'info'>;
  const giMatch = /GI\s+([\d.]+)/i.exec(message);
  const gi = giMatch ? Number.parseFloat(giMatch[1]) : undefined;
  const anomaliesMatch = /(\d+)\s+anomal/i.exec(message);
  const anomalyCount = anomaliesMatch ? Number.parseInt(anomaliesMatch[1], 10) : 0;

  const anomalyLines = message
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('⚠'))
    .map((line) => line.replace(/^⚠\s*(ELEVATED|CRITICAL|WARNING):\s*/i, '').trim())
    .filter(Boolean);

  return {
    type: 'heartbeat',
    severity: state,
    gi,
    anomalies: anomalyLines.length > 0 ? anomalyLines : undefined,
    title: `Heartbeat: ${state.toUpperCase()} · GI ${gi ?? '–'} · ${anomalyCount} anomalies`,
    tags: ['heartbeat', 'gaia', state],
    verified: false,
  };
}

function parseZeus(message: string): Partial<EpiconEntry> | null {
  if (!/^zeus:/i.test(message)) return null;

  if (/verification confirmed/i.test(message)) {
    const fileMatch = /reviewed\s+([\w.-]+)/i.exec(message);
    return {
      type: 'zeus-verify',
      severity: 'nominal',
      title: `ZEUS: Verification confirmed${fileMatch ? ` · ${fileMatch[1]}` : ''}`,
      tags: ['zeus', 'verification', 'confirmed'],
      verified: true,
      verifiedBy: 'ZEUS',
    };
  }

  if (/verification report/i.test(message)) {
    const dateMatch = /report\s+(\S+)/i.exec(message);
    return {
      type: 'zeus-report',
      severity: 'info',
      title: `ZEUS: Verification report${dateMatch ? ` · ${dateMatch[1]}` : ''}`,
      tags: ['zeus', 'report'],
      verified: true,
      verifiedBy: 'ZEUS',
    };
  }

  return {
    type: 'zeus-verify',
    severity: 'info',
    title: message.split('\n')[0]?.trim() ?? 'ZEUS event',
    tags: ['zeus'],
    verified: false,
  };
}

function parseCatalog(message: string): Partial<EpiconEntry> | null {
  if (!/chore\(catalog\)/i.test(message)) return null;
  return {
    type: 'catalog',
    severity: 'info',
    title: 'Catalog snapshot updated',
    tags: ['catalog', 'mobius-bot', 'automated'],
    author: 'mobius-bot',
    verified: false,
  };
}

function parseEpicon(message: string): Partial<EpiconEntry> | null {
  const m = /^EPICON\s+(C-\d+):\s+(.+)/i.exec(message);
  if (!m) return null;

  return {
    type: 'epicon',
    cycle: m[1].toUpperCase(),
    severity: 'info',
    title: m[2].split('\n')[0]?.trim() ?? 'EPICON event',
    tags: ['epicon', 'backfill', m[1].toLowerCase()],
    verified: false,
    source: 'backfill',
  };
}

function parseMerge(message: string): Partial<EpiconEntry> | null {
  if (!/^Merge pull request/i.test(message)) return null;
  const lines = message.split('\n');
  const fallback = lines[0]?.trim() ?? 'Merge pull request';
  const firstNonBlank = lines.find((line, idx) => idx > 0 && line.trim().length > 0)?.trim();

  return {
    type: 'merge',
    severity: 'info',
    title: firstNonBlank ?? fallback,
    tags: ['merge', 'pr'],
    verified: false,
  };
}

function toEpiconEntry(commit: GitHubCommit): EpiconEntry | null {
  const message = commit.commit.message.trim();
  const parsed =
    parseHeartbeat(message) ?? parseZeus(message) ?? parseCatalog(message) ?? parseEpicon(message) ?? parseMerge(message);

  if (!parsed) return null;

  const email = commit.commit.author.email;
  const name = commit.commit.author.name;

  const author =
    parsed.author ??
    (email.includes('mobius-bot') || name === 'mobius-bot'
      ? 'mobius-bot'
      : email.includes('cursor') || name.includes('Cursor')
        ? 'cursor-agent'
        : name === 'Michael Judan'
          ? 'kaizencycle'
          : name);

  return {
    id: `${commit.sha.slice(0, 8)}-${parsed.type ?? 'unknown'}`,
    timestamp: commit.commit.author.date,
    author,
    title: parsed.title ?? message.split('\n')[0]?.slice(0, 120) ?? 'EPICON event',
    type: parsed.type ?? 'unknown',
    severity: parsed.severity ?? 'info',
    tags: parsed.tags ?? [],
    source: parsed.source ?? 'github-commit',
    verified: parsed.verified ?? false,
    cycle: parsed.cycle,
    body: parsed.body,
    gi: parsed.gi,
    anomalies: parsed.anomalies,
    sha: commit.sha,
    verifiedBy: parsed.verifiedBy,
  };
}

function fromMemoryFeed(): EpiconEntry[] {
  return getPublicEpiconFeed().map((item) => ({
    id: item.id,
    timestamp: item.created_at,
    author: item.submitted_by_login ?? 'operator',
    title: item.title,
    body: item.summary,
    type: 'epicon',
    severity: item.status === 'contradicted' ? 'degraded' : 'info',
    source: 'memory-feed',
    tags: item.tags,
    verified: item.status === 'verified',
  }));
}

type RenderLedgerEntry = {
  id?: unknown;
  entry_id?: unknown;
  timestamp?: unknown;
  created_at?: unknown;
  author?: unknown;
  agent?: unknown;
  title?: unknown;
  summary?: unknown;
  body?: unknown;
  category?: unknown;
  type?: unknown;
  severity?: unknown;
  tags?: unknown;
  verified?: unknown;
  status?: unknown;
  gi_at_time?: unknown;
};

function normalizeLedgerEntry(raw: RenderLedgerEntry): EpiconEntry | null {
  const id = typeof raw.id === 'string' ? raw.id : typeof raw.entry_id === 'string' ? raw.entry_id : null;
  const timestamp =
    typeof raw.timestamp === 'string' ? raw.timestamp : typeof raw.created_at === 'string' ? raw.created_at : null;
  const title = typeof raw.title === 'string' ? raw.title : typeof raw.summary === 'string' ? raw.summary : null;
  if (!id || !timestamp || !title) {
    return null;
  }

  const agent = typeof raw.agent === 'string' ? raw.agent : undefined;
  const author =
    typeof raw.author === 'string' ? raw.author : agent?.trim() ? agent.toLowerCase() : 'ledger';
  const tags = Array.isArray(raw.tags) ? raw.tags.filter((tag): tag is string => typeof tag === 'string') : [];

  return {
    id,
    timestamp,
    title,
    author,
    body: typeof raw.body === 'string' ? raw.body : undefined,
    type: (typeof raw.category === 'string' ? raw.category : typeof raw.type === 'string' ? raw.type : 'epicon') as EpiconType,
    severity: (typeof raw.severity === 'string' && isEpiconSeverity(raw.severity) ? raw.severity : 'info') as EpiconSeverity,
    source: 'ledger-api',
    tags: tags.length > 0 ? tags : agent ? [agent.toLowerCase()] : [],
    verified: Boolean(raw.verified) || raw.status === 'committed',
    category: typeof raw.category === 'string' ? raw.category : undefined,
    status: raw.status === 'committed' || raw.status === 'pending' || raw.status === 'failed' ? raw.status : undefined,
    agentOrigin: agent,
    gi: typeof raw.gi_at_time === 'number' ? raw.gi_at_time : null,
  };
}

async function fetchRenderLedgerEntries(limit = 100): Promise<{ entries: EpiconEntry[]; degraded: boolean }> {
  const renderLedgerUrl = process.env.RENDER_LEDGER_URL ?? 'https://civic-protocol-core.onrender.com';
  const renderApiKey = process.env.RENDER_API_KEY ?? '';

  try {
    const response = await fetch(`${renderLedgerUrl}/ledger/entries?limit=${limit}&sort=desc`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-Api-Key': renderApiKey,
      },
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    });

    if (!response.ok) {
      console.warn(`[epicon/feed] ledger-api unavailable, falling back to github (${response.status} ${response.statusText})`);
      return { entries: [], degraded: true };
    }

    const payload = (await response.json()) as { entries?: RenderLedgerEntry[]; items?: RenderLedgerEntry[] };
    const rows = Array.isArray(payload.entries) ? payload.entries : Array.isArray(payload.items) ? payload.items : [];
    const entries = rows.map((row) => normalizeLedgerEntry(row)).filter((row): row is EpiconEntry => row !== null);
    return { entries, degraded: false };
  } catch (error) {
    console.warn('[epicon/feed] ledger-api unavailable, falling back to github', error);
    return { entries: [], degraded: true };
  }
}

/** Align KV JSON rows with live authoring metadata (C-270 EVE synthesis). */
function coerceLedgerEntrySource(entry: EpiconEntry): EpiconEntry {
  const governanceSynthTagged = entry.tags?.includes('eve-governance-synthesis') === true;
  const eveOrigin = entry.agentOrigin?.trim() === 'EVE';
  if (entry.source === 'eve-synthesis' || eveOrigin || governanceSynthTagged) {
    const currentTags = Array.isArray(entry.tags) ? entry.tags : [];
    return {
      ...entry,
      source: 'eve-synthesis',
      author: 'EVE',
      agentOrigin: entry.agentOrigin?.trim() ? entry.agentOrigin : 'EVE',
      tags: currentTags.includes('eve') ? currentTags : [...currentTags, 'eve'],
    };
  }
  return entry;
}

async function fromRedis(): Promise<EpiconEntry[]> {
  const redis = getRedisClient();
  if (!redis) return [];

  try {
    const [primary, alias] = await Promise.all([
      redis.lrange<string>('mobius:epicon:feed', 0, 99),
      redis.lrange<string>('epicon:feed', 0, 99),
    ]);
    const combined = [...primary, ...alias];
    return combined
      .map((entry) => {
        try {
          return coerceLedgerEntrySource(JSON.parse(entry) as EpiconEntry);
        } catch {
          return null;
        }
      })
      .filter((entry): entry is EpiconEntry => entry !== null);
  } catch {
    return [];
  }
}

async function fromEveSynthesisRedis(): Promise<EpiconEntry[]> {
  const redis = getRedisClient();
  if (!redis) return [];

  try {
    const rows = await redis.lrange<string>('epicon:eve-synthesis', 0, 19);
    return rows
      .map((entry, index) => {
        try {
          const parsed = JSON.parse(entry) as Partial<EpiconEntry> & {
            id?: string;
            timestamp?: string;
            created_at?: string;
            createdAt?: string;
            summary?: string;
          };
          const timestamp = parsed.timestamp ?? parsed.created_at ?? parsed.createdAt ?? new Date().toISOString();
          const title = typeof parsed.title === 'string' ? parsed.title : parsed.summary ?? 'EVE synthesis';
          const id =
            typeof parsed.id === 'string' && parsed.id.trim().length > 0
              ? parsed.id
              : `eve-synthesis-${timestamp}-${index}`;

          return coerceLedgerEntrySource({
            ...parsed,
            id,
            timestamp,
            title,
            source: 'eve-synthesis',
            author: 'EVE',
            agentOrigin: 'EVE',
            type: parsed.type ?? 'epicon',
            severity: (typeof parsed.severity === 'string' && isEpiconSeverity(parsed.severity)
              ? parsed.severity
              : 'info') as EpiconSeverity,
            verified: Boolean(parsed.verified),
            tags: Array.isArray(parsed.tags) ? Array.from(new Set([...parsed.tags, 'eve'])) : ['eve'],
          });
        } catch {
          return null;
        }
      })
      .filter((entry): entry is EpiconEntry => entry !== null);
  } catch {
    return [];
  }
}

function isEpiconSeverity(value: string): value is EpiconSeverity {
  return (
    value === 'nominal' ||
    value === 'degraded' ||
    value === 'elevated' ||
    value === 'critical' ||
    value === 'info' ||
    value === 'low' ||
    value === 'medium' ||
    value === 'high'
  );
}

function ledgerRowToEpiconSource(row: EpiconLedgerFeedEntry): EpiconSource {
  if (row.source === 'eve-synthesis' || row.source.startsWith('eve-synthesis')) return 'eve-synthesis';
  if (row.source === 'agent_commit') return 'agent_commit';
  return 'kv-ledger';
}

function fromLocalMemoryLedger(): EpiconEntry[] {
  return getMemoryLedgerEntries(100).map((row: EpiconLedgerFeedEntry): EpiconEntry => {
    const sev = isEpiconSeverity(row.severity) ? row.severity : 'info';
    const typ = row.type as EpiconEntry['type'];
    const src = ledgerRowToEpiconSource(row);
    return coerceLedgerEntrySource({
      id: row.id,
      cycle: row.cycle,
      timestamp: row.timestamp,
      author: row.author,
      title: row.title,
      body: row.body,
      type: typ,
      severity: sev,
      gi: row.gi ?? undefined,
      source: src,
      tags: row.tags,
      verified: row.verified,
      verifiedBy: row.verifiedBy,
      category: row.category,
      confidenceTier: row.confidenceTier,
      zeusVerdict: row.zeusVerdict,
      patternType: row.patternType,
      dominantRegion: row.dominantRegion,
      derivedFrom: row.derivedFrom,
      derivedFromIds: row.derivedFromIds,
      status: row.status,
      agentOrigin: row.agentOrigin,
    });
  });
}

function dedupeSort(entries: EpiconEntry[]): EpiconEntry[] {
  const seen = new Set<string>();

  return entries
    .filter((entry) => {
      if (seen.has(entry.id)) return false;
      seen.add(entry.id);
      return true;
    })
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const page = Math.max(0, Number.parseInt(params.get('page') ?? '0', 10) || 0);
  const limit = Math.min(Math.max(1, Number.parseInt(params.get('limit') ?? '50', 10) || 50), 200);
  const typeFilter = params.get('type');
  const minGI = params.get('minGI');
  const minGiValue = minGI ? Number.parseFloat(minGI) : undefined;
  const includeCatalog = params.get('include_catalog') === 'true';

  const [{ entries: ledgerEntries, degraded: ledgerDegraded }, commits, kvEntries, eveKvEntries] = await Promise.all([
    fetchRenderLedgerEntries(100),
    fetchGitHubCommits(80),
    fromRedis(),
    fromEveSynthesisRedis(),
  ]);
  const commitEntries = commits.map(toEpiconEntry).filter((entry): entry is EpiconEntry => entry !== null);
  const memoryEntries = fromMemoryFeed();
  const localLedgerEntries = fromLocalMemoryLedger();

  let entries = dedupeSort([
    ...ledgerEntries,
    ...kvEntries,
    ...eveKvEntries,
    ...localLedgerEntries,
    ...commitEntries,
    ...memoryEntries,
  ]);

  if (typeFilter) entries = entries.filter((entry) => entry.type === typeFilter);
  if (minGiValue !== undefined && !Number.isNaN(minGiValue)) {
    entries = entries.filter(
      (entry) => entry.gi == null || entry.gi >= minGiValue,
    );
  }
  if (!includeCatalog) {
    entries = entries.filter((entry) => !(entry.type === 'catalog' && entry.author === 'mobius-bot'));
  }

  const offset = page * limit;
  const items = entries.slice(offset, offset + limit);
  const heartbeats = items.filter((entry) => entry.type === 'heartbeat');

  return NextResponse.json(
    {
      ok: true,
      count: items.length,
      total: entries.length,
      page,
      hasMore: offset + items.length < entries.length,
      sources: {
        github: commitEntries.length,
        ledgerApi: ledgerEntries.length,
        kv: kvEntries.length,
        eveKv: eveKvEntries.length,
        memory: memoryEntries.length,
        memoryLedger: localLedgerEntries.length,
        kvConfigured: !!getRedisClient(),
      },
      degraded: ledgerDegraded,
      summary: {
        latestGI: heartbeats.find((entry) => entry.gi != null)?.gi ?? null,
        degradedCount: heartbeats.filter((entry) => entry.severity === 'degraded' || entry.severity === 'critical')
          .length,
        lastHeartbeat: heartbeats[0]?.timestamp ?? null,
        lastZeusVerify: items.find((entry) => entry.type === 'zeus-verify')?.timestamp ?? null,
      },
      items,
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=120',
        'X-Mobius-Source': ledgerEntries.length > 0 ? 'epicon-ledger-api' : 'epicon-github-bridge',
        'X-Mobius-KV': getRedisClient() ? 'active' : 'unconfigured',
      },
    },
  );
}
