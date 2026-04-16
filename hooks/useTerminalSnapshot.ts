'use client';

import { useEffect, useState } from 'react';

type SnapshotLeaf = {
  ok: boolean;
  status: number;
  data: unknown;
  error: string | null;
};

export type SnapshotLaneState = {
  key: string;
  ok: boolean;
  state: string;
  statusCode?: number;
  message?: string;
  lastUpdated?: string | null;
  fallbackMode?: string | null;
};

export type TerminalSnapshot = {
  ok: boolean;
  timestamp?: string;
  cycle?: string;
  gi?: number | null;
  mode?: string | null;
  degraded?: boolean;
  meta?: { total_ms?: number };
  lanes?: SnapshotLaneState[];
  integrity?: SnapshotLeaf;
  signals?: SnapshotLeaf;
  kvHealth?: SnapshotLeaf;
  agents?: SnapshotLeaf;
  epicon?: SnapshotLeaf;
  echo?: SnapshotLeaf;
  journal?: SnapshotLeaf;
  sentiment?: SnapshotLeaf;
  runtime?: SnapshotLeaf;
  promotion?: SnapshotLeaf;
  eve?: SnapshotLeaf;
  mii?: SnapshotLeaf;
  lite?: boolean;
};

let _cache: TerminalSnapshot | null = null;
let _lastFetch = 0;
let _inflight: Promise<TerminalSnapshot> | null = null;

const STALE_MS = 60_000;
const LITE_TIMEOUT_MS = 3_000;
const FULL_TIMEOUT_MS = 15_000;

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { cache: 'no-store', signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function loadSnapshot(): Promise<TerminalSnapshot> {
  const now = Date.now();
  if (_cache && now - _lastFetch < STALE_MS) return _cache;
  if (_inflight) return _inflight;

  _inflight = (async () => {
    if (!_cache) {
      try {
        const liteRes = await fetchWithTimeout('/api/terminal/snapshot-lite', LITE_TIMEOUT_MS);
        if (liteRes.ok) {
          const liteData = (await liteRes.json()) as TerminalSnapshot;
          liteData.lite = true;
          _cache = liteData;
          _lastFetch = Date.now();
        }
      } catch {
        // lite failed — fall through to full
      }
    }

    try {
      const res = await fetchWithTimeout('/api/terminal/snapshot', FULL_TIMEOUT_MS);
      if (!res.ok) throw new Error(`snapshot failed (${res.status})`);
      const data = (await res.json()) as TerminalSnapshot;
      data.lite = false;
      _cache = data;
      _lastFetch = Date.now();
      return data;
    } catch (err) {
      if (_cache) return _cache;
      throw err;
    }
  })().finally(() => {
    _inflight = null;
  });

  return _inflight;
}

export function useTerminalSnapshot() {
  const [snapshot, setSnapshot] = useState<TerminalSnapshot | null>(_cache);
  const [loading, setLoading] = useState(!_cache);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const refresh = async () => {
      try {
        const data = await loadSnapshot();
        if (!mounted) return;
        setSnapshot(data);
        setError(null);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Snapshot load failed');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void refresh();
    const id = window.setInterval(() => {
      void refresh();
    }, STALE_MS);

    return () => {
      mounted = false;
      window.clearInterval(id);
    };
  }, []);

  return { snapshot, loading, error };
}
