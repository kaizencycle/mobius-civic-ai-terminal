import type { Agent, EpiconItem, GISnapshot, Tripwire } from './types';

export type StreamMessage =
  | { type: 'heartbeat'; cycle: string; timestamp: string; message: string }
  | { type: 'agents'; cycle: string; timestamp: string; agents: Agent[] }
  | { type: 'epicon'; cycle: string; timestamp: string; item: EpiconItem }
  | { type: 'integrity'; cycle: string; timestamp: string; gi: GISnapshot }
  | { type: 'tripwire'; cycle: string; timestamp: string; tripwires: Tripwire[] };

const API_BASE =
  (typeof window !== 'undefined'
    ? process.env.NEXT_PUBLIC_MOBIUS_API_BASE
    : ''
  )?.replace(/\/$/, '') || '';

// ── Snake → Camel transforms (mirrors api.ts) ───────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformAgent(raw: any): Agent {
  return {
    id: raw.id,
    name: raw.name,
    role: raw.role,
    color: raw.color,
    status: raw.status,
    heartbeatOk: raw.heartbeat_ok ?? raw.heartbeatOk,
    lastAction: raw.last_action ?? raw.lastAction,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformEpicon(raw: any): EpiconItem {
  return {
    id: raw.id,
    title: raw.title,
    category: raw.category,
    status: raw.status,
    confidenceTier: raw.confidence_tier ?? raw.confidenceTier,
    ownerAgent: raw.owner_agent ?? raw.ownerAgent,
    sources: raw.sources,
    timestamp: raw.timestamp,
    summary: raw.summary,
    trace: raw.trace,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformGI(raw: any): GISnapshot {
  return {
    score: raw.score,
    delta: raw.delta,
    institutionalTrust: raw.institutional_trust ?? raw.institutionalTrust,
    infoReliability: raw.info_reliability ?? raw.infoReliability,
    consensusStability: raw.consensus_stability ?? raw.consensusStability,
    weekly: raw.weekly,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformTripwire(raw: any): Tripwire {
  return {
    id: raw.id,
    label: raw.label,
    severity: raw.severity,
    owner: raw.owner,
    openedAt: raw.opened_at ?? raw.openedAt,
    action: raw.action,
  };
}

// ── Parse raw SSE payload into typed StreamMessage ───────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseStreamPayload(raw: any): StreamMessage | null {
  if (!raw || !raw.type) return null;

  switch (raw.type) {
    case 'heartbeat':
      return raw as StreamMessage;

    case 'agents':
      return {
        type: 'agents',
        cycle: raw.cycle,
        timestamp: raw.timestamp,
        agents: Array.isArray(raw.agents) ? raw.agents.map(transformAgent) : [],
      };

    case 'epicon':
      return {
        type: 'epicon',
        cycle: raw.cycle,
        timestamp: raw.timestamp,
        item: transformEpicon(raw.item),
      };

    case 'integrity':
      return {
        type: 'integrity',
        cycle: raw.cycle,
        timestamp: raw.timestamp,
        gi: transformGI(raw.gi),
      };

    case 'tripwire':
      return {
        type: 'tripwire',
        cycle: raw.cycle,
        timestamp: raw.timestamp,
        tripwires: Array.isArray(raw.tripwires) ? raw.tripwires.map(transformTripwire) : [],
      };

    default:
      return null;
  }
}

// ── SSE connection ───────────────────────────────────────────

export function connectMobiusStream(
  onMessage: (msg: StreamMessage) => void,
  onError?: (err: Event) => void,
) {
  if (!API_BASE) return null;

  const source = new EventSource(`${API_BASE}/stream/events`);

  const eventTypes = ['heartbeat', 'agents', 'epicon', 'integrity', 'tripwire'];
  for (const type of eventTypes) {
    source.addEventListener(type, (event) => {
      try {
        const raw = JSON.parse((event as MessageEvent).data);
        const msg = parseStreamPayload(raw);
        if (msg) onMessage(msg);
      } catch {
        // Malformed SSE payload — skip silently
      }
    });
  }

  source.onerror = (err) => {
    if (onError) onError(err);
  };

  return source;
}
