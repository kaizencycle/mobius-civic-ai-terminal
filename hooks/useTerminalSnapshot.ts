'use client';

import { useEffect, useState } from 'react';

type SnapshotLeaf = {
  ok: boolean;
  status: number;
  data: unknown;
  error: string | null;
};

export type TerminalSnapshot = {
  ok: boolean;
  timestamp?: string;
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
};

let _cache: TerminalSnapshot | null = null;
let _lastFetch = 0;
let _inflight: Promise<TerminalSnapshot> | null = null;

const STALE_MS = 60_000;

async function loadSnapshot(): Promise<TerminalSnapshot> {
  const now = Date.now();
  if (_cache && now - _lastFetch < STALE_MS) return _cache;
  if (_inflight) return _inflight;

  _inflight = fetch('/api/terminal/snapshot', { cache: 'no-store' })
    .then(async (res) => {
      if (!res.ok) throw new Error(`snapshot failed (${res.status})`);
      const data = (await res.json()) as TerminalSnapshot;
      _cache = data;
      _lastFetch = Date.now();
      return data;
    })
    .finally(() => {
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
