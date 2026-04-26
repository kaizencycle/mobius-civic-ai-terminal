'use client';

import { useEffect, useMemo, useState } from 'react';

type UseChamberHydrationOptions<T> = {
  previewData?: T | null;
  pollMs?: number;
  requestTimeoutMs?: number;
  lockToPreview?: boolean;
  savepointKey?: string;
  savepointMinCount?: number;
  getSavepointCount?: (payload: T) => number;
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

type BrowserSavepoint<T> = {
  payload: T;
  saved_at: string;
  count: number;
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

function defaultSavepointCount(payload: unknown): number {
  const record = asRecord(payload);
  if (!record) return 0;
  const entries = record.entries;
  if (Array.isArray(entries)) return entries.length;
  const events = record.events;
  if (Array.isArray(events)) return events.length;
  const items = record.items;
  if (Array.isArray(items)) return items.length;
  const count = record.count;
  return typeof count === 'number' && Number.isFinite(count) ? count : 0;
}

function attachSavepointMeta<T>(payload: T, meta: Record<string, unknown>): T {
  const record = asRecord(payload);
  if (!record) return payload;
  return { ...record, savepoint: meta } as T;
}

function readSavepoint<T>(key: string): BrowserSavepoint<T> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BrowserSavepoint<T>;
    if (!parsed || typeof parsed !== 'object' || !('payload' in parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSavepoint<T>(key: string, payload: T, count: number): string | null {
  if (typeof window === 'undefined') return null;
  const savedAt = new Date().toISOString();
  try {
    window.localStorage.setItem(key, JSON.stringify({ payload, count, saved_at: savedAt }));
    return savedAt;
  } catch {
    return null;
  }
}

export function useChamberHydration<T>(url: string, enabled: boolean, options: UseChamberHydrationOptions<T> = {}): UseChamberHydrationResult<T> {
  const {
    previewData = null,
    pollMs = 30_000,
    requestTimeoutMs = DEFAULT_TIMEOUT_MS,
    lockToPreview = false,
    savepointKey,
    savepointMinCount = 1,
    getSavepointCount,
  } = options;
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
    const countPayload = getSavepointCount ?? ((payload: T) => defaultSavepointCount(payload));
    const storageKey = savepointKey ? `mobius:chamber:savepoint:${savepointKey}` : null;

    if (!enabled) {
      setLoading(false);
      return () => {
        mounted = false;
      };
    }

    const savedAtBoot = storageKey ? readSavepoint<T>(storageKey) : null;
    if (savedAtBoot && countPayload(savedAtBoot.payload) >= savepointMinCount) {
      setFull(attachSavepointMeta(savedAtBoot.payload, {
        status: 'saved',
        saved_at: savedAtBoot.saved_at,
        saved_count: savedAtBoot.count,
        live_count: 0,
        reason: 'hydrated_before_live_fetch',
      }));
      setEnvelopeDegraded(true);
    }

    async function load() {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), requestTimeoutMs);
      try {
        const res = await fetch(url, { cache: 'no-store', signal: controller.signal });
        const json = (await res.json()) as unknown;
        const normalized = normalizeHydrationPayload<T>(json);
        if (!mounted) return;
        const livePayload = normalized.payload;
        let nextPayload = livePayload;
        let savepointDegraded = false;

        if (storageKey && livePayload) {
          const liveCount = countPayload(livePayload);
          const saved = readSavepoint<T>(storageKey);
          const savedCount = saved?.count ?? 0;
          if (saved && savedCount >= savepointMinCount && liveCount < savedCount) {
            nextPayload = attachSavepointMeta(saved.payload, {
              status: 'saved',
              saved_at: saved.saved_at,
              saved_count: savedCount,
              live_count: liveCount,
              reason: 'live_payload_thinner_than_saved_state',
            });
            savepointDegraded = true;
          } else if (liveCount >= savepointMinCount || liveCount >= savedCount) {
            const savedAt = writeSavepoint(storageKey, livePayload, liveCount);
            nextPayload = attachSavepointMeta(livePayload, {
              status: 'live',
              saved_at: savedAt,
              saved_count: liveCount,
              live_count: liveCount,
              reason: null,
            });
          }
        }

        setFull(nextPayload);
        setEnvelopeDegraded(normalized.envelopeDegraded || !res.ok || savepointDegraded);
        setFetchedOnce(true);
        setError(null);
        setErrorCount(0);
        currentPollMs = pollMs;
      } catch (err) {
        if (!mounted) return;
        const saved = storageKey ? readSavepoint<T>(storageKey) : null;
        if (saved && countPayload(saved.payload) >= savepointMinCount) {
          setFull(attachSavepointMeta(saved.payload, {
            status: 'saved',
            saved_at: saved.saved_at,
            saved_count: saved.count,
            live_count: 0,
            reason: 'live_fetch_failed_saved_state_used',
          }));
          setEnvelopeDegraded(true);
        }
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
  }, [enabled, url, pollMs, requestTimeoutMs, savepointKey, savepointMinCount, getSavepointCount]);

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
