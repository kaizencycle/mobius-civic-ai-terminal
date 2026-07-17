import { NextRequest, NextResponse } from 'next/server';
import { adaptAgentJournalToLedger, type AgentLedgerAdapterPreview, type AgentLedgerJournalEntry } from '@/lib/agents/ledger-adapter';
import { verifyWithZeus } from '@/lib/agents/zeus-verification';
import { parseResponseJson } from '@/lib/http/safeJson';
import { clearWarningFingerprint, recordWarningFingerprint } from '@/lib/log/warningEscalation';
import { GET as getJournal } from '@/app/api/agents/journal/route';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const JOURNAL_NON_JSON_FINGERPRINT = 'ledger-zeus-journal-non-json';

async function fetchJournal(request: NextRequest, limit: number) {
  const invoker = request.headers.get('x-mobius-invoker') ?? 'ledger-zeus';
  const url = new URL('/api/agents/journal', request.nextUrl.origin);
  url.searchParams.set('mode', 'merged');
  url.searchParams.set('limit', String(limit));

  // In-process journal handler — avoids self-HTTP that can return deployment HTML.
  const innerRequest = new NextRequest(url, {
    headers: { 'x-mobius-invoker': invoker },
  });
  const response = await getJournal(innerRequest);

  const parsed = await parseResponseJson<{ ok?: boolean; entries?: AgentLedgerJournalEntry[] }>(response);
  if (!parsed.ok) {
    const escalation = await recordWarningFingerprint(JOURNAL_NON_JSON_FINGERPRINT, {
      threshold: 6,
      context: {
        invoker,
        status: parsed.status,
        error: parsed.error,
        contentType: parsed.contentType,
        preview: parsed.bodyPreview,
      },
    });
    console.warn('[ledger-zeus] journal fetch returned non-JSON', {
      invoker,
      status: parsed.status,
      error: parsed.error,
      contentType: parsed.contentType,
      preview: parsed.bodyPreview,
      consecutive_failures: escalation.count,
      escalated: escalation.escalated,
    });
    return {
      ok: false,
      status: parsed.status,
      entries: [] as AgentLedgerJournalEntry[],
    };
  }

  await clearWarningFingerprint(JOURNAL_NON_JSON_FINGERPRINT);

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
