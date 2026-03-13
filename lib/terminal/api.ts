import type { Agent, EpiconItem, GISnapshot, Tripwire } from './types';
import { mockAgents, mockEpicon, mockGI, mockTripwires } from './mock';

const API_BASE =
  (typeof window !== 'undefined'
    ? process.env.NEXT_PUBLIC_MOBIUS_API_BASE
    : ''
  )?.replace(/\/$/, '') || '';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchJson(path: string): Promise<any | null> {
  if (!API_BASE) return null;

  try {
    const res = await fetch(`${API_BASE}${path}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch {
    return null;
  }
}

// ── Transformers: API snake_case → frontend camelCase ────────
//
// Each transformer accepts either snake_case (from API) or
// camelCase (from mock/fallback) so it works in both paths.

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

// ── API functions ────────────────────────────────────────────
//
// Each function:
//   1. fetches from the live API
//   2. unwraps the envelope ({ cycle, timestamp, data })
//   3. transforms snake_case → camelCase
//   4. falls back to mock data if API is unavailable

export async function getAgents(): Promise<Agent[]> {
  const raw = await fetchJson('/agents/status');
  if (!raw) return mockAgents;
  const agents = raw.agents;
  if (!Array.isArray(agents)) return mockAgents;
  return agents.map(transformAgent);
}

export async function getEpiconFeed(): Promise<EpiconItem[]> {
  const raw = await fetchJson('/epicon/feed');
  if (!raw) return mockEpicon;
  const items = raw.items;
  if (!Array.isArray(items)) return mockEpicon;
  return items.map(transformEpicon);
}

export async function getGISnapshot(): Promise<GISnapshot> {
  const raw = await fetchJson('/integrity/current');
  if (!raw) return mockGI;
  const gi = raw.gi;
  if (!gi || typeof gi !== 'object' || !('score' in gi)) return mockGI;
  return transformGI(gi);
}

export async function getTripwires(): Promise<Tripwire[]> {
  const raw = await fetchJson('/tripwires/active');
  if (!raw) return mockTripwires;
  const tripwires = raw.tripwires;
  if (!Array.isArray(tripwires)) return mockTripwires;
  return tripwires.map(transformTripwire);
}
