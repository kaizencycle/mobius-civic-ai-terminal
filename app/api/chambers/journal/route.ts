import { NextRequest, NextResponse } from 'next/server';
import { GET as getJournal } from '@/app/api/agents/journal/route';

export const dynamic = 'force-dynamic';

type DvaTier = 'ALL' | 't1' | 't2' | 't3' | 'sentinel' | 'architects';

const DVA_TIER_AGENTS: Record<Exclude<DvaTier, 'ALL'>, string[]> = {
  t1: ['ECHO'],
  t2: ['ATLAS', 'ZEUS'],
  t3: ['EVE', 'JADE', 'HERMES'],
  sentinel: ['ATLAS', 'ZEUS', 'EVE'],
  architects: ['AUREA', 'DAEDALUS'],
};

function normalizeTier(input: string | null): DvaTier {
  const value = (input ?? '').trim();
  if (value === 't1' || value === 't2' || value === 't3' || value === 'sentinel' || value === 'architects') {
    return value;
  }
  return 'ALL';
}

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get('mode') ?? 'merged';
  const limit = request.nextUrl.searchParams.get('limit') ?? '100';
  const tier = normalizeTier(request.nextUrl.searchParams.get('tier'));
  const explicitAgents = request.nextUrl.searchParams.getAll('agent').map((agent) => agent.trim()).filter(Boolean);
  const tierAgents = tier === 'ALL' ? [] : (DVA_TIER_AGENTS[tier] ?? []);
  const requestedAgents = explicitAgents.length > 0 ? explicitAgents : tierAgents;
  const cycle = request.nextUrl.searchParams.get('cycle');
  const q = new URLSearchParams({ mode, limit });
  for (const agent of requestedAgents) {
    q.append('agent', agent);
  }
  if (cycle) q.set('cycle', cycle);

  const forwarded = new NextRequest(`${request.nextUrl.origin}/api/agents/journal?${q.toString()}`, {
    headers: request.headers,
  });

  try {
    const res = await getJournal(forwarded);
    const json = (await res.json()) as { entries?: unknown[]; mode?: 'hot' | 'canon' | 'merged' };
    return NextResponse.json({
      ok: true,
      mode: json.mode ?? (mode as 'hot' | 'canon' | 'merged'),
      entries: json.entries ?? [],
      tier,
      canonical_available: true,
      fallback: false,
      timestamp: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({
      ok: true,
      mode: mode as 'hot' | 'canon' | 'merged',
      entries: [],
      tier,
      canonical_available: false,
      fallback: true,
      timestamp: new Date().toISOString(),
    });
  }
}
