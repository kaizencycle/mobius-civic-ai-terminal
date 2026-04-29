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
const DEFAULT_QUORUM = 3;

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

type QuorumGroup = {
  key: string;
  cycle: string;
  journal_ids: string[];
  quorum_reached: boolean;
  status: 'quorum_reached' | 'needs_more_agents' | 'blocked';
};

type QuorumResponse = {
  ok: boolean;
  summary?: {
    total_groups: number;
    quorum_reached: number;
    needs_more_agents: number;
    blocked: number;
    quorum_required: number;
  };
  groups?: QuorumGroup[];
  error?: string;
};

type AggregatedSummary = NonNullable<WriteResponse['summary']>;

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

function parseQuorum(value: string | null): number {
  const parsed = Number.parseInt(value ?? String(DEFAULT_QUORUM), 10);
  if (!Number.isFinite(parsed) || parsed <= 1) return DEFAULT_QUORUM;
  return Math.min(parsed, 8);
}

function shouldEnableWrites(request: NextRequest): boolean {
  if (boolFromEnv(process.env.MOBIUS_AGENT_LEDGER_AUTOWRITE)) return true;
  return request.headers.get('x-mobius-agent-ledger-write')?.trim().toLowerCase() === 'enabled';
}

function shouldRequireQuorum(request: NextRequest): boolean {
  if (boolFromEnv(process.env.MOBIUS_AGENT_LEDGER_REQUIRE_QUORUM)) return true;
  return request.nextUrl.searchParams.get('require_quorum') === 'true';
}

function serviceHeaders(request: NextRequest): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: request.headers.get('Authorization') ?? '',
    'x-mobius-service-token': request.headers.get('x-mobius-service-token') ?? '',
  };
}

function emptySummary(): AggregatedSummary {
  return { journal_entries: 0, eligible: 0, written: 0, duplicate: 0, failed: 0, skipped: 0 };
}

function mergeSummary(total: AggregatedSummary, next: AggregatedSummary): AggregatedSummary {
  return {
    journal_entries: total.journal_entries + next.journal_entries,
    eligible: total.eligible + next.eligible,
    written: total.written + next.written,
    duplicate: total.duplicate + next.duplicate,
    failed: total.failed + next.failed,
    skipped: total.skipped + next.skipped,
  };
}

async function fetchQuorumJournalIds(request: NextRequest, limit: number, quorumRequired: number, activeCycle: string) {
  const quorumUrl = new URL('/api/agents/ledger-quorum', request.nextUrl.origin);
  quorumUrl.searchParams.set('limit', String(limit));
  quorumUrl.searchParams.set('quorum', String(quorumRequired));

  const response = await fetch(quorumUrl, { method: 'GET', cache: 'no-store' });
  const payload = (await response.json()) as QuorumResponse;
  if (!response.ok || !payload.ok) {
    return {
      ok: false as const,
      error: payload.error ?? 'agent_ledger_quorum_fetch_failed',
      status: response.status,
      journalIds: [] as string[],
      quorum: payload,
    };
  }

  const journalIds = Array.from(
    new Set(
      (payload.groups ?? [])
        .filter((group) => group.cycle === activeCycle)
        .filter((group) => group.quorum_reached && group.status === 'quorum_reached')
        .flatMap((group) => group.journal_ids),
    ),
  );

  return {
    ok: true as const,
    journalIds,
    quorum: payload,
  };
}

async function callWriteEndpoint(
  request: NextRequest,
  body: { limit: number; cycle: string; dry_run: boolean; journal_id?: string },
): Promise<{ ok: boolean; status: number; payload: WriteResponse }> {
  const writeUrl = new URL('/api/agents/ledger-adapter/write', request.nextUrl.origin);
  const response = await fetch(writeUrl, {
    method: 'POST',
    cache: 'no-store',
    headers: serviceHeaders(request),
    body: JSON.stringify({
      mode: 'merged',
      limit: body.limit,
      cycle: body.cycle,
      journal_id: body.journal_id,
      dry_run: body.dry_run,
    }),
  });
  const payload = (await response.json()) as WriteResponse;
  return { ok: response.ok && payload.ok, status: response.status, payload };
}

export async function GET(request: NextRequest) {
  const authError = getServiceAuthError(request);
  if (authError) return authError;

  const activeCycle = currentCycleId();
  const dryRun = !shouldEnableWrites(request);
  const limit = parseLimit(request.nextUrl.searchParams.get('limit'));
  const force = request.nextUrl.searchParams.get('force') === 'true';
  const requireQuorum = shouldRequireQuorum(request);
  const quorumRequired = parseQuorum(request.nextUrl.searchParams.get('quorum'));
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
        require_quorum: requireQuorum,
        quorum_required: quorumRequired,
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
        require_quorum: requireQuorum,
        quorum_required: quorumRequired,
        lastRun,
        timestamp: new Date().toISOString(),
      },
      { headers: { 'Cache-Control': 'private, no-store, max-age=0, must-revalidate' } },
    );
  }

  let quorum: QuorumResponse | null = null;
  let quorumJournalIds: string[] | null = null;
  if (requireQuorum) {
    const quorumResult = await fetchQuorumJournalIds(request, limit, quorumRequired, activeCycle);
    quorum = quorumResult.quorum;
    if (!quorumResult.ok) {
      return NextResponse.json(
        {
          ok: false,
          skipped: true,
          reason: quorumResult.error,
          status: quorumResult.status,
          activeCycle,
          dry_run: dryRun,
          require_quorum: true,
          quorum_required: quorumRequired,
          timestamp: new Date().toISOString(),
        },
        { status: quorumResult.status || 502, headers: { 'Cache-Control': 'private, no-store, max-age=0, must-revalidate' } },
      );
    }

    quorumJournalIds = quorumResult.journalIds;
    if (quorumJournalIds.length === 0) {
      return NextResponse.json(
        {
          ok: true,
          skipped: true,
          reason: 'no_quorum_reached_for_active_cycle',
          activeCycle,
          dry_run: dryRun,
          require_quorum: true,
          quorum_required: quorumRequired,
          quorum,
          timestamp: new Date().toISOString(),
        },
        { headers: { 'Cache-Control': 'private, no-store, max-age=0, must-revalidate' } },
      );
    }
  }

  let summary = emptySummary();
  const receipts: unknown[] = [];
  let firstFailure: { status: number; error: string } | null = null;

  if (quorumJournalIds) {
    for (const journalId of quorumJournalIds) {
      const write = await callWriteEndpoint(request, { limit, cycle: activeCycle, dry_run: dryRun, journal_id: journalId });
      if (!write.ok) {
        firstFailure = firstFailure ?? { status: write.status, error: write.payload.error ?? 'agent_ledger_write_cron_failed' };
        continue;
      }
      summary = mergeSummary(summary, write.payload.summary ?? emptySummary());
      receipts.push(...(write.payload.receipts ?? []));
    }
  } else {
    const write = await callWriteEndpoint(request, { limit, cycle: activeCycle, dry_run: dryRun });
    if (!write.ok) {
      return NextResponse.json(
        {
          ok: false,
          skipped: false,
          reason: write.payload.error ?? 'agent_ledger_write_cron_failed',
          status: write.status,
          activeCycle,
          dry_run: dryRun,
          require_quorum: false,
          timestamp: new Date().toISOString(),
        },
        { status: write.status || 502, headers: { 'Cache-Control': 'private, no-store, max-age=0, must-revalidate' } },
      );
    }
    summary = write.payload.summary ?? emptySummary();
    receipts.push(...(write.payload.receipts ?? []));
  }

  if (firstFailure && receipts.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        skipped: false,
        reason: firstFailure.error,
        status: firstFailure.status,
        activeCycle,
        dry_run: dryRun,
        require_quorum: requireQuorum,
        quorum_required: quorumRequired,
        quorum,
        timestamp: new Date().toISOString(),
      },
      { status: firstFailure.status || 502, headers: { 'Cache-Control': 'private, no-store, max-age=0, must-revalidate' } },
    );
  }

  const run: LastRun = {
    cycle: activeCycle,
    timestamp: new Date().toISOString(),
    dry_run: dryRun,
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
      version: 'C-295.phase7.agent-ledger-quorum-enforced-cron.v1',
      activeCycle,
      dry_run: dryRun,
      require_quorum: requireQuorum,
      quorum_required: quorumRequired,
      quorum_journal_ids: quorumJournalIds,
      quorum,
      gi: currentGi,
      threshold,
      guardrails: {
        writes_require_env_or_header: true,
        dry_run_default: true,
        rate_limit_seconds: RUN_TTL_SECONDS,
        quorum_enforcement_optional: true,
        no_vault_mic_fountain_canon_mutation: true,
      },
      summary,
      receipts,
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
