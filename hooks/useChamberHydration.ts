'use client';

import { useEffect, useMemo, useState } from 'react';

type UseChamberHydrationOptions<T> = {
  previewData?: T | null;
  pollMs?: number;
};

export type ChamberHydrationStatus = 'preview' | 'hydrating' | 'live' | 'degraded' | 'stale';

type UseChamberHydrationResult<T> = {
  preview: T | null;
  full: T | null;
  data: T | null;
  loading: boolean;
  error: string | null;
  degraded: boolean;
  status: ChamberHydrationStatus;
  source: 'echo-digest' | 'api' | 'mixed';
};

export function useChamberHydration<T>(url: string, enabled: boolean, options: UseChamberHydrationOptions<T> = {}): UseChamberHydrationResult<T> {
  const { previewData = null, pollMs = 30_000 } = options;
  const [full, setFull] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    if (!enabled) {
      setLoading(false);
      return () => {
        mounted = false;
      };
    }

    async function load() {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        const json = (await res.json()) as T;
        if (!mounted) return;
        setFull(json);
        setError(null);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Chamber fetch failed');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    setLoading(true);
    void load();
    const id = window.setInterval(load, pollMs);
    return () => {
      mounted = false;
      window.clearInterval(id);
    };
  }, [enabled, url, pollMs]);

  const data = useMemo(() => full ?? previewData ?? null, [full, previewData]);

  const status: ChamberHydrationStatus = useMemo(() => {
    if (error && previewData) return 'degraded';
    if (error) return 'stale';
    if (full) return 'live';
    // C-290: full fetch completed but returned no usable payload — promote
    // previewData to 'live' rather than staying stuck in 'hydrating'.
    if (!loading && previewData) return 'live';
    if (loading && previewData) return 'hydrating';
    if (previewData) return 'preview';
    return loading ? 'hydrating' : 'stale';
  }, [error, previewData, full, loading]);

  const source: 'echo-digest' | 'api' | 'mixed' = full ? (previewData ? 'mixed' : 'api') : 'echo-digest';

  return {
    preview: previewData,
    full,
    data,
    loading,
    error,
    degraded: Boolean(error),
    status,
    source,
  };
}
