import type { Agent, EpiconItem, GISnapshot, Tripwire, LedgerEntry, CivicRadarAlert } from './types';
import type { CycleIntegritySummary } from '@/lib/echo/integrity-engine';
import { ledgerBackfill, type LedgerBackfillEntry } from '@/lib/mock/ledgerBackfill';
import { integrityStatus, type IntegrityStatusResponse } from '@/lib/mock/integrityStatus';
import { mockAgents, mockEpicon, mockTripwires } from './mock';
import { transformAgent, transformEpicon, transformTripwire } from './transforms';

const API_BASE =
  (typeof window !== 'undefined'
    ? process.env.NEXT_PUBLIC_MOBIUS_API_BASE
    : ''
  )?.replace(/\/$/, '') || '';

export const isLiveAPI = !!API_BASE;

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchInternalJson(path: string): Promise<any | null> {
  try {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch {
    return null;
  }
}

export function integrityStatusToGISnapshot(status: IntegrityStatusResponse): GISnapshot {
  return {
    score: status.global_integrity,
    delta: -0.01,
    institutionalTrust: status.signals.geopolitics,
    infoReliability: status.signals.information,
    consensusStability: status.signals.sentiment,
    weekly: [0.84, 0.83, 0.82, 0.81, 0.8, 0.79, status.global_integrity],
  };
}

function backfillEntryToLedger(entry: LedgerBackfillEntry): LedgerEntry {
  return {
    id: entry.id,
    cycleId: entry.cycle,
    type: 'epicon',
    agentOrigin: entry.agent,
    timestamp: entry.timestamp,
    title: entry.title,
    summary: entry.summary,
    integrityDelta: 0,
    status: entry.status === 'verified' ? 'committed' : entry.status === 'contradicted' ? 'reverted' : 'pending',
    category: entry.category,
    confidenceTier: entry.confidence_tier,
    tags: entry.tags,
    source: 'backfill',
  };
}

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

export async function getIntegrityStatus(): Promise<IntegrityStatusResponse> {
  const raw = await fetchInternalJson('/api/integrity-status');
  if (!raw || typeof raw !== 'object' || !(raw as Record<string, unknown>).ok) return integrityStatus;
  return raw as IntegrityStatusResponse;
}

export async function getGISnapshot(): Promise<GISnapshot> {
  const status = await getIntegrityStatus();
  return integrityStatusToGISnapshot(status);
}

export async function getTripwires(): Promise<Tripwire[]> {
  const raw = await fetchJson('/tripwires/active');
  if (!raw) return mockTripwires;
  const tripwires = raw.tripwires;
  if (!Array.isArray(tripwires)) return mockTripwires;
  return tripwires.map(transformTripwire);
}

export async function getLedgerBackfill(): Promise<LedgerEntry[]> {
  const raw = await fetchInternalJson('/api/ledger/backfill');
  const items = raw && typeof raw === 'object' && Array.isArray((raw as { items?: unknown[] }).items)
    ? (raw as { items: LedgerBackfillEntry[] }).items
    : ledgerBackfill;

  return items.map(backfillEntryToLedger);
}

// ── ECHO Live Feed ───────────────────────────────────────────

export type EchoFeedData = {
  epicon: EpiconItem[];
  ledger: LedgerEntry[];
  alerts: CivicRadarAlert[];
  integrity: CycleIntegritySummary | null;
  status: {
    lastIngest: string | null;
    cycleId: string;
    totalIngested: number;
    counts: { epicon: number; ledger: number; alerts: number };
  };
};

/**
 * Fetches live ECHO data from the internal API route.
 * Returns null if the fetch fails (terminal falls back to mock-only data).
 */
export async function getEchoFeed(): Promise<EchoFeedData | null> {
  try {
    const res = await fetch('/api/echo/feed', { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
