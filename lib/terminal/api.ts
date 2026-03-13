import type { Agent, EpiconItem, GISnapshot, Tripwire } from './types';
import { mockAgents, mockEpicon, mockGI, mockTripwires } from './mock';

const API_BASE =
  (typeof window !== 'undefined'
    ? process.env.NEXT_PUBLIC_MOBIUS_API_BASE
    : ''
  )?.replace(/\/$/, '') || '';

async function fetchJson<T>(path: string, fallback: T): Promise<T> {
  if (!API_BASE) return fallback;

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

export function getAgents() {
  return fetchJson<Agent[]>('/agents/status', mockAgents);
}

export function getEpiconFeed() {
  return fetchJson<EpiconItem[]>('/epicon/feed', mockEpicon);
}

export function getGISnapshot() {
  return fetchJson<GISnapshot>('/integrity/current', mockGI);
}

export function getTripwires() {
  return fetchJson<Tripwire[]>('/tripwires/active', mockTripwires);
}
