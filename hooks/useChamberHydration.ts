'use client';

import { useEffect, useMemo, useState } from 'react';

type UseChamberHydrationOptions<T> = {
  previewData?: T | null;
  pollMs?: number;
  requestTimeoutMs?: number;
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

type ChamberEnvelope<T> = {
  ok?: boolean;
  degraded?: boolean;
  fallback?: boolean;
  data?: T;
};

const DEFAULT_TIMEOUT_MS = 8_000;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
}

function normalizeHydrationPayload<T>(json: unknown): { payload: T | null; envelopeDegraded: boolean } {
  const record = asRecord(json);
  if (!record) return { payload: null, envelopeDegraded: true };

  const envelope = record as ChamberEnvelope<T>;
  const payload = (envelope.data ?? json) as T;
  const envelopeDegraded = envelope.ok === false || envelope.degraded === true;
  return { payload, envelopeDegraded };
}

export function useChamberHydration<T>(url: string, enabled: boolean, options: UseChamberHydrationOptions<T> = {}): UseChamberHydrationResult<T> {
  const { previewData = null, pollMs = 30_000, requestTimeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const [full, setFull] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [fetchedOnce, setFetchedOnce] = useState(false);
  const [envelopeDegraded, setEnvelopeDegraded] = useState(false);

  useEffect(() => {
    let mounted = true;

    if (!enabled) {
      setLoading(false);
      return () => {
        mounted = false;
      };
    }

    async function load() {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), requestTimeoutMs);
      try {
        const res = await fetch(url, { cache: 'no-store', signal: controller.signal });
        const json = (await res.json()) as unknown;
        const normalized = normalizeHydrationPayload<T>(json);
        if (!mounted) return;
        setFull(normalized.payload);
        setEnvelopeDegraded(normalized.envelopeDegraded || !res.ok);
        setFetchedOnce(true);
        setError(null);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Chamber fetch failed');
        setFetchedOnce(true);
      } finally {
        window.clearTimeout(timeoutId);
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
  }, [enabled, url, pollMs, requestTimeoutMs]);

  const data = useMemo(() => full ?? previewData ?? null, [full, previewData]);

  const status: ChamberHydrationStatus = useMemo(() => {
    if ((error || envelopeDegraded) && previewData) return 'degraded';
    if (error || envelopeDegraded) return 'stale';
    if (full) return 'live';
    if (fetchedOnce && previewData) return 'live';
    if (loading && previewData) return 'hydrating';
    if (previewData) return 'preview';
    return loading ? 'hydrating' : 'stale';
  }, [error, envelopeDegraded, previewData, full, loading, fetchedOnce]);

  const source: 'echo-digest' | 'api' | 'mixed' = full ? (previewData ? 'mixed' : 'api') : 'echo-digest';

  return {
    preview: previewData,
    full,
    data,
    loading,
    error,
    degraded: Boolean(error || envelopeDegraded),
    status,
    source,
  };
}
