import type { NextRequest } from 'next/server';
import { log } from '@/lib/log';
import { NextResponse } from 'next/server';
import { getJournalRedisClient } from '@/lib/agents/journalLane';
import { processJournalCanonOutbox } from '@/lib/agents/journalCanonOutbox';
import { bearerMatchesToken } from '@/lib/vault-v2/auth';
import { kvGet, kvSet, KV_KEYS } from '@/lib/kv/store';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const RETRY_QUEUE_CAP = 100;
const DEFAULT_LEDGER_URL = 'https://civic-protocol-core-ledger.onrender.com';

function clampLimit(input: string | null): number {
  const parsed = Number(input ?? '10');
  if (!Number.isFinite(parsed) || parsed <= 0) return 10;
  return Math.min(50, Math.max(1, Math.floor(parsed)));
}

function normalizeBaseUrl(input: string | undefined | null): string | null {
  const trimmed = input?.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/+$/, '');
}

function isGithubUrl(input: string | null): boolean {
  if (!input) return false;
  return input.includes('github.com') || input.includes('api.github.com');
}

function resolveJournalCanonLedgerTarget(): { ok: true; ledgerBase: string } | { ok: false; error: string; target: string } {
  const candidates = [
    ['CIVIC_LEDGER_URL', process.env.CIVIC_LEDGER_URL],
    ['RENDER_LEDGER_URL', process.env.RENDER_LEDGER_URL],
    ['NEXT_PUBLIC_CIVIC_LEDGER_URL', process.env.NEXT_PUBLIC_CIVIC_LEDGER_URL],
    ['JOURNAL_CANON_SUBSTRATE_TARGET', process.env.JOURNAL_CANON_SUBSTRATE_TARGET],
    ['NEXT_PUBLIC_SUBSTRATE_API_BASE', process.env.NEXT_PUBLIC_SUBSTRATE_API_BASE],
    // Legacy aliases still referenced by older sweep/runtime paths.
    ['SUBSTRATE_GITHUB_REPO', process.env.SUBSTRATE_GITHUB_REPO],
    ['GITHUB_REPO_URL', process.env.GITHUB_REPO_URL],
  ] as const;

  for (const [name, value] of candidates) {
    const normalized = normalizeBaseUrl(value);
    if (!normalized) continue;
    if (isGithubUrl(normalized)) {
      return { ok: false, error: `${name}_POINTS_TO_GITHUB`, target: normalized };
    }
    if (normalized.includes('onrender.com') || normalized.includes('civic-protocol') || normalized.startsWith('http')) {
      return { ok: true, ledgerBase: normalized };
    }
  }

  return { ok: true, ledgerBase: DEFAULT_LEDGER_URL };
}

async function ensureRetryQueueExists(): Promise<void> {
  try {
    const existing = await kvGet<string[]>(KV_KEYS.SUBSTRATE_RETRY_QUEUE);
    if (existing === null) {
      await kvSet(KV_KEYS.SUBSTRATE_RETRY_QUEUE, []);
    }
  } catch {
    // diagnostic-only; never fail the main path
  }
}

export async function GET(request: NextRequest) {
  const cronHeader = request.headers.get('x-vercel-cron');
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET || '';
  const manuallyAuthed = bearerMatchesToken(authHeader, cronSecret);

  if (!cronHeader && !manuallyAuthed) {
    return NextResponse.json({ ok: false, error: 'Cron-only endpoint' }, { status: 403 });
  }

  const target = resolveJournalCanonLedgerTarget();
  if (!target.ok) {
    console.error(
      '[journal-canonize] BLOCKED — ledger env var points to GitHub, not the Civic Protocol Ledger.',
      'Set CIVIC_LEDGER_URL=https://civic-protocol-core-ledger.onrender.com in Vercel env vars.',
      'Misconfigured target:', target.target,
    );
    return NextResponse.json(
      { ok: false, error: target.error, blocked: true, target: target.target },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const substrateWriteTarget =
    process.env.JOURNAL_CANON_SUBSTRATE_TARGET ??
    process.env.SUBSTRATE_GITHUB_REPO ??
    process.env.GITHUB_REPO_URL ??
    null;
  const substrateConfigured = Boolean(substrateWriteTarget);
  const githubToken = Boolean(process.env.SUBSTRATE_GITHUB_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim());
  const github_direct_write_configured = !substrateConfigured && githubToken;

  log.info('[journal-canonize] running', {
    substrate_target: target.ledgerBase,
    substrate_configured: substrateConfigured,
    github_direct_write_configured,
  });

  void ensureRetryQueueExists();

  const redis = getJournalRedisClient();
  const limit = clampLimit(request.nextUrl.searchParams.get('limit'));

  try {
    const result = await processJournalCanonOutbox(redis, limit);

    if (result.failed > 0) {
      try {
        const existing = await kvGet<string[]>(KV_KEYS.SUBSTRATE_RETRY_QUEUE) ?? [];
        const marker = `failed-${new Date().toISOString()}`;
        const updated = [...existing, marker].slice(-RETRY_QUEUE_CAP);
        await kvSet(KV_KEYS.SUBSTRATE_RETRY_QUEUE, updated);
      } catch {
        // non-fatal
      }
    }

    return NextResponse.json(
      {
        ok: true,
        source: 'cron-journal-canonize',
        limit,
        ...result,
        timestamp: new Date().toISOString(),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const is403 = errMsg.includes('403') || (err as { status?: number })?.status === 403;

    if (is403) {
      console.warn('[journal-canonize] 403 from substrate write path — queuing to SUBSTRATE_RETRY_QUEUE');
      try {
        const existing = await kvGet<string[]>(KV_KEYS.SUBSTRATE_RETRY_QUEUE) ?? [];
        const marker = `403-${new Date().toISOString()}`;
        const updated = [...existing, marker].slice(-RETRY_QUEUE_CAP);
        await kvSet(KV_KEYS.SUBSTRATE_RETRY_QUEUE, updated);
        console.warn('[journal-canonize] queued to SUBSTRATE_RETRY_QUEUE, count:', updated.length);
      } catch {
        // non-fatal
      }
      return NextResponse.json(
        {
          ok: true,
          source: 'cron-journal-canonize',
          status: 'queued',
          reason: '403_substrate',
          timestamp: new Date().toISOString(),
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    console.error('[journal-canonize] failed:', errMsg);
    return NextResponse.json(
      { ok: false, error: errMsg, timestamp: new Date().toISOString() },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
