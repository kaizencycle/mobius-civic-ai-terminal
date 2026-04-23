export type DataSource = 'live' | 'mock' | 'stale-cache' | 'github-commit';

export interface ResponseEnvelope {
  source: DataSource;
  freshAt: string | null;
  staleAt: string | null;
  degraded: boolean;
  degradedReason?: string;
}

export function liveEnvelope(fetchedAt?: string): ResponseEnvelope {
  return {
    source: 'live',
    freshAt: fetchedAt ?? new Date().toISOString(),
    staleAt: null,
    degraded: false,
  };
}

export function mockEnvelope(reason: string): ResponseEnvelope {
  return {
    source: 'mock',
    freshAt: null,
    staleAt: new Date().toISOString(),
    degraded: true,
    degradedReason: reason,
  };
}

export function staleCacheEnvelope(
  originalFetchAt: string,
  reason: string
): ResponseEnvelope {
  return {
    source: 'stale-cache',
    freshAt: originalFetchAt,
    staleAt: new Date().toISOString(),
    degraded: true,
    degradedReason: reason,
  };
}

export function isFresh(timestamp: string, maxAgeMs = 5 * 60 * 1000): boolean {
  try {
    return Date.now() - new Date(timestamp).getTime() < maxAgeMs;
  } catch {
    return false;
  }
}
