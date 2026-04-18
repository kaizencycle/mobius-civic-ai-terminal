/**
 * GET /api/vault/contributions
 *
 * Reads `vault:deposits` (newest-first LPUSH list) and aggregates reserve
 * contributed from journal-scored deposits (not wallets).
 *
 * Query:
 *   group_by=agent | cycle  (default agent)
 *   cycle=C-285     optional filter: only deposits whose journal_id parses to this cycle
 *   limit=200       max rows scanned (default 200, max 200)
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { handbookCorsHeaders } from '@/lib/http/handbook-cors';
import {
  aggregateByAgent,
  aggregateByCycle,
  buildDepositReplayMetrics,
} from '@/lib/vault/contributions';
import { listVaultDeposits } from '@/lib/vault/vault';

export const dynamic = 'force-dynamic';

export async function OPTIONS(req: NextRequest) {
  const cors = handbookCorsHeaders(req.headers.get('origin'));
  if (!cors) return new NextResponse(null, { status: 204 });
  return new NextResponse(null, { status: 204, headers: cors });
}

export async function GET(req: NextRequest) {
  const cors = handbookCorsHeaders(req.headers.get('origin'));
  const groupBy = (req.nextUrl.searchParams.get('group_by') ?? 'agent').toLowerCase();
  if (groupBy !== 'agent' && groupBy !== 'cycle') {
    return NextResponse.json(
      { error: 'Unsupported group_by; use group_by=agent or group_by=cycle' },
      { status: 400, headers: { ...(cors ?? {}) } },
    );
  }

  const limitParam = Number(req.nextUrl.searchParams.get('limit') ?? '200');
  const limit = Number.isFinite(limitParam)
    ? Math.max(1, Math.min(200, Math.floor(limitParam)))
    : 200;

  const cycleFilter = req.nextUrl.searchParams.get('cycle')?.trim() || null;

  const deposits = await listVaultDeposits(limit);
  const replay = buildDepositReplayMetrics(deposits);

  const base = {
    ok: true,
    source: 'vault:deposits',
    description:
      'Reserve units accrued from scored agent journal entries (not MIC wallet stakes).',
    rows_scanned: deposits.length,
    limit,
    cycle_filter: cycleFilter,
    timestamp: new Date().toISOString(),
  };

  if (groupBy === 'agent') {
    const { agents, aggregates } = aggregateByAgent(deposits, replay, cycleFilter);
    const total_reserve = Number(
      agents.reduce((s, a) => s + a.total_reserve_contributed, 0).toFixed(6),
    );

    return NextResponse.json(
      {
        ...base,
        group_by: 'agent',
        total_reserve_contributed: total_reserve,
        agents,
        aggregates: {
          ...aggregates,
          duplication_note:
            aggregates.deposits_after_first_signature_repeat > 0
              ? `${aggregates.deposits_after_first_signature_repeat} deposit(s) in this window follow a repeated content_signature (novelty/decay replay).`
              : 'No repeated content_signature within this scan window.',
        },
      },
      {
        headers: {
          ...(cors ?? {}),
          'Cache-Control': 'no-store',
          'X-Mobius-Source': 'vault-contributions',
        },
      },
    );
  }

  const { cycles, aggregates } = aggregateByCycle(deposits, replay, cycleFilter);
  const total_reserve = Number(
    cycles.reduce((s, c) => s + c.total_reserve_contributed, 0).toFixed(6),
  );

  return NextResponse.json(
    {
      ...base,
      group_by: 'cycle',
      total_reserve_contributed: total_reserve,
      cycles,
      aggregates: {
        ...aggregates,
        duplication_note:
          aggregates.deposits_after_first_signature_repeat > 0
            ? `${aggregates.deposits_after_first_signature_repeat} deposit(s) in this window follow a repeated content_signature (novelty/decay replay).`
            : 'No repeated content_signature within this scan window.',
      },
    },
    {
      headers: {
        ...(cors ?? {}),
        'Cache-Control': 'no-store',
        'X-Mobius-Source': 'vault-contributions',
      },
    },
  );
}
