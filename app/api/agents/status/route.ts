import { NextResponse } from 'next/server';
import { mockAgentStatus } from '@/lib/mock-data';
import { KV_KEYS, kvGet } from '@/lib/kv/store';
import {
  isFresh,
  liveEnvelope,
  mockEnvelope,
  staleCacheEnvelope,
} from '@/lib/response-envelope';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type HeartbeatPayload = {
  ok?: boolean;
  timestamp?: string;
  cycle?: string;
  cycleId?: string;
};

type GiStatePayload = {
  cycle?: string;
  cycleId?: string;
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

function toAgentStatus(status: 'active' | 'unknown') {
  return AGENT_BASE.map((agent) => ({
    ...agent,
    status,
    detail:
      status === 'active'
        ? 'Live heartbeat observed from KV.'
        : 'Heartbeat is stale; agent state is currently unknown.',
    heartbeat_ok: status === 'active',
    last_action:
      status === 'active'
        ? 'Live heartbeat received'
        : 'Awaiting fresh runtime heartbeat',
  }));
}

function parseHeartbeat(rawHeartbeat: HeartbeatPayload | string | null): HeartbeatPayload | null {
  if (!rawHeartbeat) return null;
  if (typeof rawHeartbeat !== 'string') return rawHeartbeat;

  try {
    return JSON.parse(rawHeartbeat) as HeartbeatPayload;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const [rawHeartbeat, giState] = await Promise.all([
      kvGet<HeartbeatPayload | string>(KV_KEYS.HEARTBEAT),
      kvGet<GiStatePayload>(KV_KEYS.GI_STATE),
    ]);

    const heartbeat = parseHeartbeat(rawHeartbeat);
    const timestamp = heartbeat?.timestamp ?? new Date().toISOString();
    const cycle = heartbeat?.cycle ?? heartbeat?.cycleId ?? giState?.cycle ?? giState?.cycleId ?? 'unknown';

    staleSnapshot = { cycle, timestamp };

    if (heartbeat?.timestamp && isFresh(heartbeat.timestamp, 25 * 60 * 1000)) {
      return NextResponse.json({
        ok: true,
        ...liveEnvelope(timestamp),
        source: 'kv-heartbeat',
        cycle,
        timestamp,
        agents: toAgentStatus('active'),
      });
    }

    return NextResponse.json({
      ok: true,
      ...staleCacheEnvelope(timestamp, 'Heartbeat stale'),
      source: 'stale-cache',
      cycle,
      timestamp,
      agents: toAgentStatus('unknown'),
    });
  } catch (error) {
    const mock = mockAgentStatus();
    console.error('agents/status KV read failed', error);

    if (staleSnapshot) {
      return NextResponse.json({
        ok: true,
        ...staleCacheEnvelope(staleSnapshot.timestamp, 'Heartbeat stale'),
        source: 'stale-cache',
        cycle: staleSnapshot.cycle,
        timestamp: staleSnapshot.timestamp,
        agents: toAgentStatus('unknown'),
      });
    }

    return NextResponse.json({
      ...mock,
      ...mockEnvelope('Runtime status unreachable'),
    });
  }
}
