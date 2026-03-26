import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

type EpiconEntry = {
  id: string;
  cycle?: string;
  timestamp: string;
  author: string;
  title: string;
  body?: string;
  type: 'heartbeat' | 'catalog' | 'zeus-verify' | 'zeus-report' | 'epicon' | 'merge' | 'unknown';
  severity: 'nominal' | 'degraded' | 'elevated' | 'critical' | 'info';
  gi?: number;
  anomalies?: string[];
  sha?: string;
  source: 'github-commit' | 'backfill';
  tags: string[];
  verified: boolean;
  verifiedBy?: string;
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

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.BACKFILL_SECRET;
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

function parseCommit(commit: GitHubCommit): EpiconEntry | null {
  const message = commit.commit.message.trim();
  const authorName = commit.commit.author.name;
  const authorEmail = commit.commit.author.email;

  let partial: Partial<EpiconEntry> | null = null;

  const hb = /^heartbeat:\s*(nominal|degraded|elevated|critical)/i.exec(message);
  if (hb) {
    const status = hb[1].toLowerCase() as EpiconEntry['severity'];
    const giMatch = /GI\s+([\d.]+)/i.exec(message);
    const gi = giMatch ? Number.parseFloat(giMatch[1]) : undefined;
    const anomaliesMatch = /(\d+)\s+anomal/i.exec(message);
    const anomalyCount = anomaliesMatch ? Number.parseInt(anomaliesMatch[1], 10) : 0;

    partial = {
      type: 'heartbeat',
      severity: status,
      gi,
      title: `Heartbeat: ${status.toUpperCase()} · GI ${gi ?? '–'} · ${anomalyCount} anomalies`,
      tags: ['heartbeat', status],
      verified: false,
    };
  } else if (/^zeus:/i.test(message)) {
    const isConfirm = /verification confirmed/i.test(message);
    const reviewed = /reviewed\s+([\w.-]+)/i.exec(message);

    partial = {
      type: isConfirm ? 'zeus-verify' : 'zeus-report',
      severity: isConfirm ? 'nominal' : 'info',
      title: isConfirm
        ? `ZEUS: Verification confirmed${reviewed ? ` · ${reviewed[1]}` : ''}`
        : message.split('\n')[0]?.trim() ?? 'ZEUS report',
      tags: ['zeus', 'verification'],
      verified: isConfirm,
      verifiedBy: isConfirm ? 'ZEUS' : undefined,
    };
  } else if (/chore\(catalog\)/i.test(message)) {
    partial = {
      type: 'catalog',
      severity: 'info',
      title: 'Catalog snapshot updated',
      tags: ['catalog', 'automated'],
      verified: false,
      author: 'mobius-bot',
    };
  } else if (/^EPICON\s+(C-\d+):\s+(.+)/i.test(message)) {
    const match = /^EPICON\s+(C-\d+):\s+(.+)/i.exec(message);
    partial = {
      type: 'epicon',
      severity: 'info',
      cycle: match?.[1].toUpperCase(),
      title: match?.[2].split('\n')[0]?.trim() ?? 'EPICON entry',
      tags: ['epicon', 'backfill'],
      verified: false,
      source: 'backfill',
    };
  } else if (/^Merge pull request/i.test(message)) {
    const lines = message.split('\n');
    const title = lines.find((line, idx) => idx > 0 && line.trim().length > 0)?.trim() ?? lines[0]?.trim() ?? 'Merge';
    partial = {
      type: 'merge',
      severity: 'info',
      title,
      tags: ['merge', 'pr'],
      verified: false,
    };
  }

  if (!partial) return null;

  const author =
    partial.author ??
    (authorEmail.includes('mobius-bot')
      ? 'mobius-bot'
      : authorEmail.includes('cursor') || authorName.includes('Cursor')
        ? 'cursor-agent'
        : authorName === 'Michael Judan'
          ? 'kaizencycle'
          : authorName);

  return {
    id: `${commit.sha.slice(0, 8)}-${partial.type ?? 'unknown'}`,
    timestamp: commit.commit.author.date,
    author,
    title: partial.title ?? message.split('\n')[0]?.trim() ?? 'Commit event',
    type: partial.type ?? 'unknown',
    severity: partial.severity ?? 'info',
    tags: partial.tags ?? [],
    source: partial.source ?? 'github-commit',
    verified: partial.verified ?? false,
    verifiedBy: partial.verifiedBy,
    gi: partial.gi,
    anomalies: partial.anomalies,
    body: partial.body,
    cycle: partial.cycle,
    sha: commit.sha,
  };
}

async function fetchCommits(maxPages = 5): Promise<GitHubCommit[]> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const out: GitHubCommit[] = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const url = `https://api.github.com/repos/kaizencycle/mobius-civic-ai-terminal/commits?per_page=100&sha=main&page=${page}`;
    const res = await fetch(url, { headers, cache: 'no-store' });
    if (!res.ok) break;
    const data: unknown = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;
    out.push(...(data as GitHubCommit[]));
    if (data.length < 100) break;
  }

  return out;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const redis = getRedisClient();
  if (!redis) {
    return NextResponse.json(
      { ok: false, error: 'KV not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.' },
      { status: 503 },
    );
  }

  try {
    const commits = await fetchCommits(5);
    const entries = commits.map(parseCommit).filter((entry): entry is EpiconEntry => entry !== null);

    const existingRaw = await redis.lrange<string>('mobius:epicon:feed', 0, -1);
    const existingIds = new Set(
      existingRaw
        .map((item) => {
          try {
            const parsed = JSON.parse(item) as Partial<EpiconEntry>;
            return parsed.id;
          } catch {
            return null;
          }
        })
        .filter((id): id is string => Boolean(id)),
    );

    const toWrite = entries.filter((entry) => !existingIds.has(entry.id));

    if (toWrite.length > 0) {
      await redis.lpush(
        'mobius:epicon:feed',
        ...toWrite.map((entry) => JSON.stringify(entry)),
      );
    }

    return NextResponse.json({
      ok: true,
      parsed: entries.length,
      skipped: entries.length - toWrite.length,
      written: toWrite.length,
      sample: toWrite.slice(0, 3).map((entry) => ({ id: entry.id, type: entry.type, title: entry.title })),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

export async function GET() {
  const kvConfigured = Boolean(getRedisClient());
  const backfillProtected = Boolean(process.env.BACKFILL_SECRET);

  return NextResponse.json({
    ok: true,
    ready: kvConfigured && backfillProtected,
    kvConfigured,
    backfillProtected,
    instructions: kvConfigured
      ? 'POST with Authorization: Bearer $BACKFILL_SECRET to seed history'
      : 'Configure UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN first',
  });
}
