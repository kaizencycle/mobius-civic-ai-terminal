import { NextRequest, NextResponse } from 'next/server';
import { adaptAgentJournalToLedger, type AgentLedgerAdapterPreview } from '@/lib/agents/ledger-adapter';
import { buildAgentLedgerQuorumGroups } from '@/lib/agents/ledger-quorum';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function fetchJournal(request: NextRequest, limit: number) {
  const url = new URL('/api/agents/journal', request.nextUrl.origin);
  url.searchParams.set('mode', 'merged');
  url.searchParams.set('limit', String(limit));

  const response = await fetch(url, { cache: 'no-store' });
  const payload = await response.json();

  return {
    ok: response.ok && payload?.ok,
    status: response.status,
    entries: Array.isArray(payload?.entries) ? payload.entries : [],
  };
}

export async function GET(request: NextRequest) {
  const limit = Number.parseInt(request.nextUrl.searchParams.get('limit') ?? '50', 10) || 50;
  const quorumRequired = Number.parseInt(request.nextUrl.searchParams.get('quorum') ?? '3', 10) || 3;

  const journal = await fetchJournal(request, limit);
  if (!journal.ok) {
    return NextResponse.json({ ok: false, error: 'journal_fetch_failed' }, { status: 502 });
  }

  const previews: AgentLedgerAdapterPreview[] = journal.entries
    .map(adaptAgentJournalToLedger);

  const { summary, groups } = buildAgentLedgerQuorumGroups(previews, quorumRequired);

  return NextResponse.json(
    {
      ok: true,
      readonly: true,
      version: 'C-295.phase6.agent-ledger-quorum.v1',
      filters: { limit, quorum_required: quorumRequired },
      summary,
      groups,
      canon: [
        'Quorum groups are derived from agent ledger previews only.',
        'No writes are performed in this endpoint.',
        'Quorum requires multiple agents agreeing within same cycle/category/severity.',
      ],
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
      },
    },
  );
}
