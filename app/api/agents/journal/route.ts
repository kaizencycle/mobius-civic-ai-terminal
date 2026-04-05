import { NextRequest, NextResponse } from 'next/server';
import { isValidCronSecretBearer } from '@/lib/security/serviceAuth';
import {
  appendAgentJournalEntry,
  getAgentJournalEntries,
  parseAgentJournalEntry,
} from '@/lib/agents/journal';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const agent = searchParams.get('agent');
  const cycle = searchParams.get('cycle');
  const category = searchParams.get('category');

  const entries = await getAgentJournalEntries({
    agent,
    cycle,
    category,
    status: 'committed',
  });

  return NextResponse.json({
    ok: true,
    entries,
    count: entries.length,
    filters: {
      agent: agent ?? null,
      cycle: cycle ?? null,
      category: category ?? null,
      status: 'committed',
    },
  });
}

export async function POST(request: NextRequest) {
  if (!isValidCronSecretBearer(request.headers.get('authorization'))) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = parseAgentJournalEntry(body);
  if (!parsed) {
    return NextResponse.json({ ok: false, error: 'Invalid AgentJournalEntry payload' }, { status: 400 });
  }

  const stored = await appendAgentJournalEntry(parsed);

  return NextResponse.json({
    ok: true,
    entry: stored,
  });
}
