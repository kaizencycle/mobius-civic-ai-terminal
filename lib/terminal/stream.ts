import type { Agent, EpiconItem, GISnapshot, Tripwire } from './types';
import { transformAgent, transformEpicon, transformGI, transformTripwire } from './transforms';
import { asRecord, str } from './raw';

export type StreamMessage =
  | { type: 'heartbeat'; cycle: string; timestamp: string; message: string }
  | { type: 'agents'; cycle: string; timestamp: string; agents: Agent[] }
  | { type: 'epicon'; cycle: string; timestamp: string; item: EpiconItem }
  | { type: 'integrity'; cycle: string; timestamp: string; gi: GISnapshot }
  | { type: 'tripwire'; cycle: string; timestamp: string; tripwires: Tripwire[] };

const API_BASE =
  (typeof window !== 'undefined'
    ? process.env.NEXT_PUBLIC_MOBIUS_API_BASE ?? process.env.NEXT_PUBLIC_TERMINAL_API_BASE
    : ''
  )?.replace(/\/$/, '') || '';

function parseStreamPayload(raw: unknown): StreamMessage | null {
  const r = asRecord(raw);
  if (!r.type) return null;

  switch (r.type) {
    case 'heartbeat':
      return {
        type: 'heartbeat',
        cycle: str(r.cycle),
        timestamp: str(r.timestamp),
        message: str(r.message),
      };

    case 'agents':
      return {
        type: 'agents',
        cycle: str(r.cycle),
        timestamp: str(r.timestamp),
        agents: Array.isArray(r.agents) ? r.agents.map(transformAgent) : [],
      };

    case 'epicon':
      return {
        type: 'epicon',
        cycle: str(r.cycle),
        timestamp: str(r.timestamp),
        item: transformEpicon(r.item),
      };

    case 'integrity':
      return {
        type: 'integrity',
        cycle: str(r.cycle),
        timestamp: str(r.timestamp),
        gi: transformGI(r.gi),
      };

    case 'tripwire':
      return {
        type: 'tripwire',
        cycle: str(r.cycle),
        timestamp: str(r.timestamp),
        tripwires: Array.isArray(r.tripwires) ? r.tripwires.map(transformTripwire) : [],
      };

    default:
      return null;
  }
}

export type StreamConnectionStatus = 'live' | 'reconnecting' | 'offline';

// ── Optimization 3: exponential backoff reconnection ─────────────────────────
// Retries at 2s, 4s, 8s, 16s, then caps at 30s. Resets on successful open.

const MAX_BACKOFF_MS = 30_000;
const BASE_BACKOFF_MS = 2_000;

export function connectMobiusStream(
  onMessage: (msg: StreamMessage) => void,
  onStatusChange?: (status: StreamConnectionStatus) => void,
): { close(): void } | null {
  if (!API_BASE) return null;

  let es: EventSource | null = null;
  let retryCount = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const eventTypes = ['heartbeat', 'agents', 'epicon', 'integrity', 'tripwire'];

  function connect() {
    if (closed) return;

    es = new EventSource(`${API_BASE}/stream/events`);

    es.onopen = () => {
      retryCount = 0;
      onStatusChange?.('live');
    };

    for (const type of eventTypes) {
      es.addEventListener(type, (event) => {
        try {
          const raw = JSON.parse((event as MessageEvent).data);
          const msg = parseStreamPayload(raw);
          if (msg) onMessage(msg);
        } catch {
          // Malformed SSE payload — skip silently
        }
      });
    }

    es.onerror = () => {
      if (closed) return;
      if (es?.readyState === EventSource.CONNECTING) {
        // Browser is already attempting to reconnect natively
        onStatusChange?.('reconnecting');
      } else {
        // Connection hard-closed — take over with backoff reconnect
        es?.close();
        es = null;
        onStatusChange?.('reconnecting');
        const delay = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * Math.pow(2, retryCount));
        retryCount += 1;
        retryTimer = setTimeout(connect, delay);
      }
    };
  }

  connect();

  return {
    close() {
      closed = true;
      if (retryTimer !== null) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      es?.close();
      es = null;
    },
  };
}
