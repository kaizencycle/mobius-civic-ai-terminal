import { NextRequest, NextResponse } from 'next/server';
import { adaptAgentJournalToLedger, type AgentLedgerAdapterPreview } from '@/lib/agents/ledger-adapter';
import { verifyWithZeus } from '@/lib/agents/zeus-verification';
import { parseResponseJson } from '@/lib/http/safeJson';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function fetchJournal(request: NextRequest, limit: number) {
  const url = new URL('/api/agents/journal', request.nextUrl.origin);
  url.searchParams.set('mode', 'merged');
  url.searchParams.set('limit', String(limit));

  const invoker = request.headers.get('x-mobius-invoker') ?? 'ledger-zeus';
  const response = await fetch(url, {
    cache: 'no-store',
    headers: { 'x-mobius-invoker': invoker },
    signal: AbortSignal.timeout(10_000),
  });

  const parsed = await parseResponseJson<{ ok?: boolean; entries?: unknown[] }>(response);
  if (!parsed.ok) {
    console.warn('[ledger-zeus] journal fetch returned non-JSON', {
      invoker,
      status: parsed.status,
      error: parsed.error,
      contentType: parsed.contentType,
      preview: parsed.bodyPreview,
    });
    return {
      ok: false,
      status: parsed.status,
      entries: [] as unknown[],
    };
  }

  const payload = parsed.data;
  return {
    ok: response.ok && payload?.ok !== false,
    status: response.status,
    entries: Array.isArray(payload?.entries) ? payload.entries : [],
  };
}

export async function GET(request: NextRequest) {
  const limit = Number.parseInt(request.nextUrl.searchParams.get('limit') ?? '50', 10) || 50;

  const journal = await fetchJournal(request, limit);
  if (!journal.ok) {
    return NextResponse.json({ ok: false, error: 'journal_fetch_failed' }, { status: 502 });
  }

  const previews: AgentLedgerAdapterPreview[] = journal.entries.map(adaptAgentJournalToLedger);

  const evaluated = previews.map((preview) => ({
    preview,
    zeus: verifyWithZeus(preview),
  }));

  const verified = evaluated.filter((row) => row.zeus.zeus_verified);

  const journal_ids = Array.from(
    new Set(verified.map((row) => row.preview.journal_id)),
  );

  return NextResponse.json(
    {
      ok: true,
      readonly: true,
      version: 'C-295.phase8.agent-ledger-zeus.v1',
      summary: {
        total: previews.length,
        verified: verified.length,
        rejected: previews.length - verified.length,
      },
      journal_ids,
      evaluated: evaluated.map((row) => ({
        journal_id: row.preview.journal_id,
        agent: row.preview.agent,
        zeus: row.zeus,
      })),
      canon: [
        'ZEUS verifies integrity of agent ledger previews before write.',
        'No writes are performed in this endpoint.',
        'Verification enforces eligibility, identity, and minimum confidence.',
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
