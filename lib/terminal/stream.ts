export type StreamMessage =
  | { type: 'heartbeat'; cycle: string; timestamp: string; message: string }
  | { type: 'agents'; cycle: string; timestamp: string; agents: unknown[] }
  | { type: 'epicon'; cycle: string; timestamp: string; item: unknown }
  | { type: 'integrity'; cycle: string; timestamp: string; gi: unknown }
  | { type: 'tripwire'; cycle: string; timestamp: string; tripwires: unknown[] };

const API_BASE =
  (typeof window !== 'undefined'
    ? process.env.NEXT_PUBLIC_MOBIUS_API_BASE
    : ''
  )?.replace(/\/$/, '') || '';

export function connectMobiusStream(
  onMessage: (msg: StreamMessage) => void,
  onError?: (err: Event) => void,
) {
  if (!API_BASE) return null;

  const source = new EventSource(`${API_BASE}/stream/events`);

  const eventTypes = ['heartbeat', 'agents', 'epicon', 'integrity', 'tripwire'];
  for (const type of eventTypes) {
    source.addEventListener(type, (event) => {
      onMessage(JSON.parse((event as MessageEvent).data));
    });
  }

  source.onerror = (err) => {
    if (onError) onError(err);
  };

  return source;
}
