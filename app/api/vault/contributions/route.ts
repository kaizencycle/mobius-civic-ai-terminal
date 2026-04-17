/**
 * GET /api/vault/contributions
 *
 * Reads `vault:deposits` (newest-first LPUSH list) and aggregates reserve
 * contributed by agent. Source is journal-scored deposits, not wallets.
 *
 * Query:
 *   group_by=agent  (default; only supported value today)
 *   limit=200       (max rows scanned from the list tail; default 200)
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { handbookCorsHeaders } from '@/lib/http/handbook-cors';
import { listVaultDeposits } from '@/lib/vault/vault';

export const dynamic = 'force-dynamic';

export async function OPTIONS(req: NextRequest) {
  const cors = handbookCorsHeaders(req.headers.get('origin'));
  if (!cors) return new NextResponse(null, { status: 204 });
  return new NextResponse(null, { status: 204, headers: cors });
}

type AgentContribution = {
  agent: string;
  total_reserve_contributed: number;
  deposit_count: number;
  last_deposit_at: string | null;
  last_journal_id: string | null;
};

export async function GET(req: NextRequest) {
  const cors = handbookCorsHeaders(req.headers.get('origin'));
  const groupBy = (req.nextUrl.searchParams.get('group_by') ?? 'agent').toLowerCase();
  if (groupBy !== 'agent') {
    return NextResponse.json(
      { error: 'Unsupported group_by; use group_by=agent' },
      { status: 400, headers: { ...(cors ?? {}) } },
    );
  }

  const limitParam = Number(req.nextUrl.searchParams.get('limit') ?? '200');
  const limit = Number.isFinite(limitParam)
    ? Math.max(1, Math.min(200, Math.floor(limitParam)))
    : 200;

  const deposits = await listVaultDeposits(limit);

  const byAgent = new Map<string, AgentContribution>();

  for (const d of deposits) {
    const agent = d.agent;
    const prev = byAgent.get(agent);
    const amt = d.deposit_amount;
    if (!prev) {
      byAgent.set(agent, {
        agent,
        total_reserve_contributed: amt,
        deposit_count: 1,
        last_deposit_at: d.timestamp,
        last_journal_id: d.journal_id,
      });
    } else {
      prev.total_reserve_contributed = Number((prev.total_reserve_contributed + amt).toFixed(6));
      prev.deposit_count += 1;
    }
  }

  const agents = [...byAgent.values()].sort((a, b) =>
    a.agent.localeCompare(b.agent, undefined, { sensitivity: 'base' }),
  );

  const total_reserve = Number(
    agents.reduce((s, a) => s + a.total_reserve_contributed, 0).toFixed(6),
  );

  return NextResponse.json(
    {
      ok: true,
      group_by: 'agent',
      source: 'vault:deposits',
      description:
        'Reserve units accrued from scored agent journal entries (not MIC wallet stakes).',
      rows_scanned: deposits.length,
      limit,
      total_reserve_contributed: total_reserve,
      agents,
      timestamp: new Date().toISOString(),
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
