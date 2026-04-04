import { NextResponse } from 'next/server';
import { mockAgentStatus } from '@/lib/mock-data';
import {
  isFresh,
  liveEnvelope,
  mockEnvelope,
  staleCacheEnvelope,
} from '@/lib/response-envelope';

type RuntimeFreshnessStatus = 'fresh' | 'nominal' | 'stale' | 'degraded' | 'unknown';

type RuntimeStatusResponse = {
  ok?: boolean;
  last_run: string | null;
  cycle_id?: string | null;
  freshness?: {
    status?: RuntimeFreshnessStatus;
    seconds?: number | null;
  };
};

const AGENT_BASE = [
  { id: 'atlas', name: 'ATLAS', role: 'Strategic Reasoning', tier: 'Sentinel', color: 'cerulean' },
  { id: 'zeus', name: 'ZEUS', role: 'Verification Authority', tier: 'Sentinel', color: 'gold' },
  { id: 'hermes', name: 'HERMES', role: 'Routing and Prioritization', tier: 'Steward', color: 'coral' },
  { id: 'aurea', name: 'AUREA', role: 'Oversight and Synthesis', tier: 'Architect', color: 'amber' },
  { id: 'jade', name: 'JADE', role: 'Annotation and Memory Framing', tier: 'Architect', color: 'jade' },
  { id: 'daedalus', name: 'DAEDALUS', role: 'Systems Builder', tier: 'Architect', color: 'bronze' },
  { id: 'echo', name: 'ECHO', role: 'Event Ingestion', tier: 'Steward', color: 'silver' },
  { id: 'eve', name: 'EVE', role: 'Observer / Watchtower', tier: 'Observer', color: 'rose' },
] as const;

let staleSnapshot: { cycle: string; timestamp: string } | null = null;

function toAgentStatus(status: 'alive' | 'offline') {
  return AGENT_BASE.map((agent) => ({
    ...agent,
    status,
    detail:
      status === 'alive'
        ? 'Live heartbeat observed from runtime status.'
        : 'Heartbeat is stale; agent is offline until a fresh runtime heartbeat arrives.',
    heartbeat_ok: status === 'alive',
    last_action:
      status === 'alive'
        ? 'Live heartbeat received'
        : 'Awaiting fresh runtime heartbeat',
  }));
}

export async function GET(request: Request) {
  try {
    const runtimeUrl = new URL('/api/runtime/status', request.url);
    const runtimeRes = await fetch(runtimeUrl, { cache: 'no-store' });
    if (!runtimeRes.ok) throw new Error(`runtime status ${runtimeRes.status}`);

    const runtime = (await runtimeRes.json()) as RuntimeStatusResponse;
    const timestamp = runtime.last_run ?? new Date().toISOString();
    const cycle = runtime.cycle_id ?? 'unknown';

    staleSnapshot = { cycle, timestamp };

    if (runtime.freshness?.status === 'fresh' && runtime.last_run && isFresh(runtime.last_run)) {
      return NextResponse.json({
        ok: true,
        ...liveEnvelope(timestamp),
        cycle,
        timestamp,
        agents: toAgentStatus('alive'),
      });
    }

    return NextResponse.json({
      ok: true,
      ...staleCacheEnvelope(timestamp, 'Heartbeat stale'),
      cycle,
      timestamp,
      agents: toAgentStatus('offline'),
    });
  } catch (error) {
    const mock = mockAgentStatus();
    console.error('agents/status runtime fetch failed', error);

    if (staleSnapshot) {
      return NextResponse.json({
        ok: true,
        ...staleCacheEnvelope(staleSnapshot.timestamp, 'Heartbeat stale'),
        cycle: staleSnapshot.cycle,
        timestamp: staleSnapshot.timestamp,
        agents: toAgentStatus('offline'),
      });
    }

    return NextResponse.json({
      ...mock,
      ...mockEnvelope('Runtime status unreachable'),
    });
  }
}
