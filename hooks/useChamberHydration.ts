'use client';

import { useEffect, useMemo, useState } from 'react';

type UseChamberHydrationOptions<T> = {
  previewData?: T | null;
  pollMs?: number;
  requestTimeoutMs?: number;
  lockToPreview?: boolean;
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
  stabilizationActive: boolean;
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
  const { previewData = null, pollMs = 30_000, requestTimeoutMs = DEFAULT_TIMEOUT_MS, lockToPreview = false } = options;
  const [full, setFull] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [fetchedOnce, setFetchedOnce] = useState(false);
  const [envelopeDegraded, setEnvelopeDegraded] = useState(false);
  // OPT-3 (C-291): track consecutive errors for exponential backoff.
  // Previously the hook polled at a fixed pollMs even after repeated failures,
  // compounding serverless invocation waste when a chamber is persistently down.
  const [errorCount, setErrorCount] = useState(0);

  useEffect(() => {
    let mounted = true;
    let currentPollMs = pollMs;
    let timerId: number | null = null;

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
        setErrorCount(0);
        currentPollMs = pollMs;
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Chamber fetch failed');
        setFetchedOnce(true);
        setErrorCount((n) => {
          const next = n + 1;
          currentPollMs = Math.min(pollMs * Math.pow(2, next), 300_000);
          return next;
        });
      } finally {
        window.clearTimeout(timeoutId);
        if (mounted) setLoading(false);
        if (mounted) {
          timerId = window.setTimeout(() => { void load(); }, currentPollMs);
        }
      }
    }

    setLoading(true);
    void load();
    return () => {
      mounted = false;
      if (timerId !== null) window.clearTimeout(timerId);
    };
  }, [enabled, url, pollMs, requestTimeoutMs]);

  const data = useMemo(() => {
    if (lockToPreview && previewData) return previewData;
    return full ?? previewData ?? null;
  }, [full, previewData, lockToPreview]);

  const status: ChamberHydrationStatus = useMemo(() => {
    if (lockToPreview && previewData) return 'preview';
    if ((error || envelopeDegraded) && previewData) return 'degraded';
    if (error || envelopeDegraded) return 'stale';
    if (full) return 'live';
    if (fetchedOnce && previewData) return 'live';
    if (loading && previewData) return 'hydrating';
    if (previewData) return 'preview';
    return loading ? 'hydrating' : 'stale';
  }, [error, envelopeDegraded, previewData, full, loading, fetchedOnce, lockToPreview]);

  const source: 'echo-digest' | 'api' | 'mixed' = lockToPreview && previewData
    ? 'echo-digest'
    : full
      ? (previewData ? 'mixed' : 'api')
      : 'echo-digest';

  return {
    preview: previewData,
    full,
    data,
    loading,
    error,
    degraded: Boolean(error || envelopeDegraded),
    status,
    source,
    stabilizationActive: lockToPreview,
  };
}
