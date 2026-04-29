import { NextRequest, NextResponse } from 'next/server';
import { currentCycleId } from '@/lib/eve/cycle-engine';
import { kvGet, kvSet, loadGIState } from '@/lib/kv/store';
import { getServiceAuthError } from '@/lib/security/serviceAuth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const RUN_KEY = 'agent-ledger-write:last-run';
const RUN_TTL_SECONDS = 60 * 10;
const DEFAULT_GI_THRESHOLD = 0.65;
const DEFAULT_LIMIT = 25;

type LastRun = {
  cycle: string;
  timestamp: string;
  dry_run: boolean;
  written: number;
  duplicate: number;
  failed: number;
  skipped: number;
};

type WriteResponse = {
  ok: boolean;
  dry_run: boolean;
  summary?: {
    journal_entries: number;
    eligible: number;
    written: number;
    duplicate: number;
    failed: number;
    skipped: number;
  };
  receipts?: unknown[];
  error?: string;
};

function boolFromEnv(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true';
}

function numberFromEnv(value: string | undefined, fallback: number): number {
  const parsed = Number.parseFloat(value ?? '');
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseLimit(value: string | null): number {
  const parsed = Number.parseInt(value ?? String(DEFAULT_LIMIT), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(parsed, 50);
}

function shouldEnableWrites(request: NextRequest): boolean {
  if (boolFromEnv(process.env.MOBIUS_AGENT_LEDGER_AUTOWRITE)) return true;
  return request.headers.get('x-mobius-agent-ledger-write')?.trim().toLowerCase() === 'enabled';
}

export async function GET(request: NextRequest) {
  const authError = getServiceAuthError(request);
  if (authError) return authError;

  const activeCycle = currentCycleId();
  const dryRun = !shouldEnableWrites(request);
  const limit = parseLimit(request.nextUrl.searchParams.get('limit'));
  const force = request.nextUrl.searchParams.get('force') === 'true';
  const threshold = numberFromEnv(process.env.MOBIUS_AGENT_LEDGER_GI_THRESHOLD, DEFAULT_GI_THRESHOLD);
  const gi = await loadGIState();
  const currentGi = gi?.global_integrity ?? null;

  if (typeof currentGi === 'number' && currentGi < threshold) {
    return NextResponse.json(
      {
        ok: true,
        skipped: true,
        reason: 'gi_below_agent_ledger_write_threshold',
        activeCycle,
        dry_run: dryRun,
        gi: currentGi,
        threshold,
        timestamp: new Date().toISOString(),
      },
      { headers: { 'Cache-Control': 'private, no-store, max-age=0, must-revalidate' } },
    );
  }

  const lastRun = await kvGet<LastRun>(RUN_KEY);
  if (lastRun && lastRun.cycle === activeCycle && !force) {
    return NextResponse.json(
      {
        ok: true,
        skipped: true,
        reason: 'rate_limited_same_cycle_window',
        activeCycle,
        dry_run: dryRun,
        lastRun,
        timestamp: new Date().toISOString(),
      },
      { headers: { 'Cache-Control': 'private, no-store, max-age=0, must-revalidate' } },
    );
  }

  const writeUrl = new URL('/api/agents/ledger-adapter/write', request.nextUrl.origin);
  const response = await fetch(writeUrl, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      Authorization: request.headers.get('Authorization') ?? '',
      'x-mobius-service-token': request.headers.get('x-mobius-service-token') ?? '',
    },
    body: JSON.stringify({
      mode: 'merged',
      limit,
      cycle: activeCycle,
      dry_run: dryRun,
    }),
  });

  const payload = (await response.json()) as WriteResponse;
  if (!response.ok || !payload.ok) {
    return NextResponse.json(
      {
        ok: false,
        skipped: false,
        reason: payload.error ?? 'agent_ledger_write_cron_failed',
        status: response.status,
        activeCycle,
        dry_run: dryRun,
        timestamp: new Date().toISOString(),
      },
      { status: response.status || 502, headers: { 'Cache-Control': 'private, no-store, max-age=0, must-revalidate' } },
    );
  }

  const summary = payload.summary ?? { journal_entries: 0, eligible: 0, written: 0, duplicate: 0, failed: 0, skipped: 0 };
  const run: LastRun = {
    cycle: activeCycle,
    timestamp: new Date().toISOString(),
    dry_run: payload.dry_run,
    written: summary.written,
    duplicate: summary.duplicate,
    failed: summary.failed,
    skipped: summary.skipped,
  };
  await kvSet(RUN_KEY, run, RUN_TTL_SECONDS);

  return NextResponse.json(
    {
      ok: true,
      skipped: false,
      version: 'C-295.phase5.agent-ledger-write-cron.v1',
      activeCycle,
      dry_run: payload.dry_run,
      gi: currentGi,
      threshold,
      guardrails: {
        writes_require_env_or_header: true,
        dry_run_default: true,
        rate_limit_seconds: RUN_TTL_SECONDS,
        no_vault_mic_fountain_canon_mutation: true,
      },
      summary,
      receipts: payload.receipts ?? [],
      timestamp: run.timestamp,
    },
    {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    },
  );
}
