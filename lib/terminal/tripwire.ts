/**
 * OPT-09 (C-323): Tripwire fetch with MOCK_TRIPWIRES that include mock-safe
 * entries for DAEDALUS (401 auth sentinel) and HERMES (µ3/µ4 signal lanes).
 * Phase 02: added TripwireEntry (UI chamber type), fetchTripwires(), resolved entries.
 */

import type { Tripwire } from './types';
import { mockTripwires } from './mock';
import { fetchInternal, fetchExternal, isLiveAPI } from './api-client';
import { transformTripwire } from './transforms';

// ── Phase 02 chamber types ───────────────────────────────────
export type TripwireSeverity = 'INFO' | 'WARN' | 'CRITICAL';

export interface TripwireEntry {
  id: string;
  severity: TripwireSeverity;
  label: string;
  agent: string;
  ts: number;
  resolved: boolean;
  resolvedAt?: number;
  resolvedBy?: string;
}

export const MOCK_CHAMBER_ENTRIES: TripwireEntry[] = [
  {
    id: 'tw-001',
    severity: 'CRITICAL',
    label: 'DAEDALUS Auth Sentinel — 401 upstream',
    agent: 'DAEDALUS',
    ts: Date.now() - 7_200_000,
    resolved: false,
  },
  {
    id: 'tw-002',
    severity: 'WARN',
    label: 'HERMES µ3 / µ4 signal lanes — structural zero',
    agent: 'HERMES',
    ts: Date.now() - 14_400_000,
    resolved: false,
  },
  {
    id: 'tw-003',
    severity: 'WARN',
    label: 'Substrate ledger POST returned 422 — HTML error body',
    agent: 'ZEUS',
    ts: Date.now() - 172_800_000,
    resolved: true,
    resolvedAt: Date.now() - 86_400_000,
    resolvedBy: 'ZEUS · C-321 sweep',
  },
  {
    id: 'tw-004',
    severity: 'CRITICAL',
    label: 'GI floor breach — ATLAS confidence below 0.60',
    agent: 'ATLAS',
    ts: Date.now() - 259_200_000,
    resolved: true,
    resolvedAt: Date.now() - 172_800_000,
    resolvedBy: 'Operator · C-320 manual override',
  },
];

function levelToSeverity(level: unknown): TripwireSeverity {
  if (level === 'high')   return 'CRITICAL';
  if (level === 'medium') return 'WARN';
  return 'INFO';
}

type PawLiveness = {
  status: 'ok' | 'degraded' | 'down';
  ts: number;
  cycle?: string;
  message?: string;
};

async function fetchPawTripwires(): Promise<TripwireEntry[]> {
  const paw = await fetchInternal('/api/sentinel/paw-liveness') as PawLiveness | null;
  if (!paw) return [];
  if (paw.status === 'ok') return [];
  return [{
    id: 'paw-liveness',
    severity: paw.status === 'down' ? 'CRITICAL' : 'WARN',
    label: paw.message ?? `PAW liveness degraded — status: ${paw.status}`,
    agent: 'ATLAS',
    ts: paw.ts,
    resolved: false,
  }];
}

export async function fetchTripwires(): Promise<TripwireEntry[]> {
  const raw = await fetchInternal('/api/tripwire/status');
  if (raw && typeof raw === 'object') {
    const payload = raw as { tripwire?: unknown; tripwires?: unknown };

    // Primary live shape: singular tripwire object from GET /api/tripwire/status
    if (payload.tripwire && typeof payload.tripwire === 'object') {
      const t = payload.tripwire as Record<string, unknown>;
      const paw = await fetchPawTripwires();
      if (!t.active) return paw;
      return [{
        id: 'runtime-tripwire',
        severity: levelToSeverity(t.level),
        label: typeof t.reason === 'string' && t.reason ? t.reason : 'Runtime tripwire active',
        agent: typeof t.triggeredBy === 'string' && t.triggeredBy
          ? t.triggeredBy.toUpperCase()
          : 'OPERATOR',
        ts: typeof t.last_updated === 'string'
          ? (new Date(t.last_updated).getTime() || Date.now())
          : Date.now(),
        resolved: false,
      }, ...paw];
    }

    // Array form
    if (Array.isArray(payload.tripwires) && payload.tripwires.length > 0) {
      const live = (payload.tripwires as TripwireEntry[]).filter((t) => t && typeof t.id === 'string');
      const paw = await fetchPawTripwires();
      return [...live, ...paw];
    }
  }
  const paw = await fetchPawTripwires();
  return paw.length > 0 ? [...MOCK_CHAMBER_ENTRIES, ...paw] : MOCK_CHAMBER_ENTRIES;
}

export const MOCK_TRIPWIRES: Tripwire[] = [
  ...mockTripwires,
  {
    id: 'TW-DAEDALUS-401',
    label: 'DAEDALUS Auth Sentinel — 401 upstream',
    severity: 'medium',
    owner: 'DAEDALUS',
    openedAt: new Date().toISOString(),
    action: 'DAEDALUS received 401 from upstream; substrate token refresh required.',
  },
  {
    id: 'TW-HERMES-MU3',
    label: 'HERMES µ3 signal lane degraded',
    severity: 'low',
    owner: 'HERMES',
    openedAt: new Date().toISOString(),
    action: 'µ3 and µ4 routing lanes operating on reduced throughput; monitoring for recovery.',
  },
];

export type TripwireSource = 'live' | 'mock';

export type TripwiresResult = {
  tripwires: Tripwire[];
  source: TripwireSource;
};

export async function getTripwiresWithSource(): Promise<TripwiresResult> {
  const internal = await fetchInternal('/api/tripwire/status');
  if (internal && typeof internal === 'object') {
    const tw = (internal as { tripwire?: unknown; tripwires?: unknown });
    if (tw.tripwire && typeof tw.tripwire === 'object') {
      const t = tw.tripwire as Record<string, unknown>;
      if (!t.active) return { tripwires: [], source: 'live' };
      const severity = t.level === 'high' || t.level === 'medium' || t.level === 'low' ? t.level : 'medium';
      return {
        tripwires: [{
          id: 'runtime-tripwire',
          label: typeof t.reason === 'string' && t.reason ? t.reason : 'Runtime tripwire active',
          severity,
          owner: typeof t.triggeredBy === 'string' && t.triggeredBy ? t.triggeredBy : 'operator',
          openedAt: typeof t.last_updated === 'string' && t.last_updated ? t.last_updated : new Date().toISOString(),
          action: 'Investigate and keep write lanes constrained until resolved.',
        }],
        source: 'live',
      };
    }
    if (Array.isArray(tw.tripwires)) {
      return { tripwires: tw.tripwires.map(transformTripwire), source: 'live' };
    }
  }

  if (isLiveAPI) {
    const ext = await fetchExternal('/tripwires/active');
    if (ext && typeof ext === 'object') {
      const list = (ext as { tripwires?: unknown }).tripwires;
      if (Array.isArray(list)) {
        return { tripwires: list.map(transformTripwire), source: 'live' };
      }
    }
  }

  return { tripwires: MOCK_TRIPWIRES, source: 'mock' };
}
