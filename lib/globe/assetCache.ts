import { createHash } from 'crypto';
import { kvGet, kvSet, isRedisAvailable } from '@/lib/kv/store';
import type { CachedGlobeAssetRecord, GlobeRenderKind } from './types';

const CACHE_PREFIX = 'globe:asset:';
const TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export function buildGlobeAssetCacheKey(params: {
  kind: GlobeRenderKind;
  cycle?: string;
  signalId?: string;
  title: string;
  severity?: string;
  prompt: string;
}): string {
  const normalized = [
    params.kind,
    params.cycle ?? '',
    params.signalId ?? '',
    params.title.trim().toLowerCase().slice(0, 200),
    params.severity ?? '',
    params.prompt.trim().slice(0, 500),
  ].join('|');
  return createHash('sha256').update(normalized).digest('hex');
}

const memoryCache = new Map<string, CachedGlobeAssetRecord>();
const MEMORY_MAX = 200;

export async function getCachedGlobeAsset(cacheKey: string): Promise<CachedGlobeAssetRecord | null> {
  if (isRedisAvailable()) {
    const v = await kvGet<CachedGlobeAssetRecord>(`${CACHE_PREFIX}${cacheKey}`);
    if (v) return v;
  }
  return memoryCache.get(cacheKey) ?? null;
}

export async function setCachedGlobeAsset(
  cacheKey: string,
  record: CachedGlobeAssetRecord,
): Promise<boolean> {
  memoryCache.set(cacheKey, record);
  if (memoryCache.size > MEMORY_MAX) {
    const first = memoryCache.keys().next().value as string | undefined;
    if (first) memoryCache.delete(first);
  }
  if (isRedisAvailable()) {
    return kvSet(`${CACHE_PREFIX}${cacheKey}`, record, TTL_SECONDS);
  }
  return true;
}
