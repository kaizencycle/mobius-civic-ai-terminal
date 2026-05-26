/**
 * OPT-09 (C-323): Tripwire fetch with MOCK_TRIPWIRES that include mock-safe
 * entries for DAEDALUS (401 auth sentinel) and HERMES (µ3/µ4 signal lanes).
 */

import type { Tripwire } from './types';
import { mockTripwires } from './mock';
import { fetchInternal, fetchExternal, isLiveAPI } from './api-client';
import { transformTripwire } from './transforms';

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
