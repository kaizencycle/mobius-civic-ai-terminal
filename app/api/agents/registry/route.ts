import { NextRequest, NextResponse } from 'next/server';
import { AGENT_REGISTRY_VERSION, getAgentScopeCard, listAgentScopeCards, scopeSummary } from '@/lib/agents/registry';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const agent = request.nextUrl.searchParams.get('agent');
  const compact = request.nextUrl.searchParams.get('compact') === 'true';

  if (agent) {
    const card = getAgentScopeCard(agent);
    if (!card) {
      return NextResponse.json({ ok: false, error: 'agent_not_registered', agent }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      version: AGENT_REGISTRY_VERSION,
      agent: card,
      canon: 'Registered agents have bounded scope. Scope precedes authority. Signatures are Phase 4.',
    }, { headers: { 'Cache-Control': 'no-store', 'X-Mobius-Source': 'agent-registry' } });
  }

  return NextResponse.json({
    ok: true,
    ...(compact ? scopeSummary() : { version: AGENT_REGISTRY_VERSION, agents: listAgentScopeCards() }),
    canon: 'Every Mobius agent must know what it may read, write, decide, and never decide.',
  }, { headers: { 'Cache-Control': 'no-store', 'X-Mobius-Source': 'agent-registry' } });
}
