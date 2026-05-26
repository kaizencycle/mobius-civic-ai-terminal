/**
 * OPT-02 (C-323): TTL-cached GI / MII / MIC waterfall.
 * source: 'live' — fetched from /api/integrity-status within TTL
 * source: 'stale' — TTL expired but cached value exists
 * source: 'mock' — live unavailable and no cache
 */

import { integrityStatus } from '@/lib/mock/integrityStatus';
import { fetchInternal } from './api-client';

export type IntegritySource = 'live' | 'stale' | 'mock';

export type IntegrityCacheEntry = {
  gi: number;
  mode: string;
  source: IntegritySource;
  fetchedAt: number;
};

const CACHE_TTL_MS = 60_000;
let _cache: IntegrityCacheEntry | null = null;

export async function getCachedIntegrity(): Promise<IntegrityCacheEntry> {
  const now = Date.now();

  if (_cache && now - _cache.fetchedAt < CACHE_TTL_MS) {
    return _cache;
  }

  const raw = await fetchInternal('/api/integrity-status');
  if (raw && typeof raw === 'object' && raw.ok) {
    const rec = raw as Record<string, unknown>;
    const gi =
      typeof rec.global_integrity === 'number' && Number.isFinite(rec.global_integrity)
        ? rec.global_integrity
        : _cache?.gi ?? integrityStatus.global_integrity;
    const mode = typeof rec.mode === 'string' ? rec.mode : _cache?.mode ?? integrityStatus.mode;
    _cache = { gi, mode, source: 'live', fetchedAt: now };
    return _cache;
  }

  if (_cache) {
    return { ..._cache, source: 'stale' };
  }

  return {
    gi: integrityStatus.global_integrity,
    mode: integrityStatus.mode,
    source: 'mock',
    fetchedAt: now,
  };
}

export function clearIntegrityCache(): void {
  _cache = null;
}
