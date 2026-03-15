import type { Agent, EpiconItem, GISnapshot, Tripwire } from './types';
import { transformAgent, transformEpicon, transformGI, transformTripwire } from './transforms';

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
