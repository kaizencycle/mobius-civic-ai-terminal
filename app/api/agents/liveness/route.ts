import { NextRequest, NextResponse } from 'next/server';
import { GET as getAgentStatus } from '@/app/api/agents/status/route';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const statusResponse = await getAgentStatus();
  const payload = await statusResponse.json().catch(() => null) as Record<string, unknown> | null;
  const agents = Array.isArray(payload?.agents) ? payload?.agents as Record<string, unknown>[] : [];

  return NextResponse.json({
    ok: true,
    timestamp: payload?.timestamp ?? new Date().toISOString(),
    cycle: payload?.cycle ?? null,
    agents: agents.map((agent) => ({
      agent: agent.name,
      status: agent.liveness ?? agent.status ?? 'DECLARED',
      lane: agent.lane ?? null,
      role: agent.role ?? null,
      last_seen: agent.last_seen ?? null,
      last_action: agent.last_action ?? null,
      last_journal: agent.last_journal ?? null,
      last_journal_at: agent.last_journal_at ?? null,
      confidence: typeof agent.confidence === 'number' ? agent.confidence : null,
      source_badges: Array.isArray(agent.source_badges) ? agent.source_badges : [],
    })),
  });
}
