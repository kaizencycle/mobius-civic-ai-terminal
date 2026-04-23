'use client';

import { useEffect, useMemo, useState } from 'react';

type UseChamberHydrationOptions<T> = {
  previewData?: T | null;
  pollMs?: number;
};

type UseChamberHydrationResult<T> = {
  preview: T | null;
  full: T | null;
  data: T | null;
  loading: boolean;
  error: string | null;
  degraded: boolean;
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

  return {
    preview: previewData,
    full,
    data,
    loading,
    error,
    degraded: Boolean(error),
  };
}
