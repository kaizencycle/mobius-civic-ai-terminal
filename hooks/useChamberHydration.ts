'use client';

import { useEffect, useState } from 'react';

type UseChamberHydrationResult<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
};

export function useChamberHydration<T>(url: string, enabled: boolean, pollMs = 30_000): UseChamberHydrationResult<T> {
  const [data, setData] = useState<T | null>(null);
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
        setData(json);
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

  return { data, loading, error };
}
