'use client';

import { useEffect, useState } from 'react';
import type { MemoryModePayload } from '@/lib/terminal/memoryMode';
// OPT-4 (C-291): import from canonical lib rather than re-declaring with a looser
// `key: string` type. Also re-exported so existing importers of this hook don't break.
import type { SnapshotLaneState } from '@/lib/terminal/snapshotLanes';
export type { SnapshotLaneState } from '@/lib/terminal/snapshotLanes';

type SnapshotLeaf = {
  ok: boolean;
  status: number;
  data: unknown;
  error: string | null;
};

export type TerminalSnapshot = {
  ok: boolean;
  timestamp?: string;
  cycle?: string;
  gi?: number | null;
  mode?: string | null;
  degraded?: boolean;
  memory_mode?: MemoryModePayload;
  meta?: { total_ms?: number };
  lanes?: SnapshotLaneState[];
  journal_summary?: { latest_agent_entries?: unknown[] };
  agent_liveness?: unknown[];
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
  vault?: SnapshotLeaf;
  micReadiness?: SnapshotLeaf;
  tripwire?: SnapshotLeaf;
  lite?: boolean;
};

// _cache holds the last validated *full* snapshot. Lite snapshots never land
// here because their `lanes` shape differs from the full route (object vs
// array) and chamber components call `lanes.filter(...)`. Exposing a lite
// payload as if it were full crashes those chambers.
let _cache: TerminalSnapshot | null = null;
let _lastFetch = 0;
let _inflight: Promise<TerminalSnapshot> | null = null;
let _lastError: string | null = null;

const STALE_MS = 60_000;
const LITE_TIMEOUT_MS = 3_000;
const FULL_TIMEOUT_MS = 15_000;

// C-283 (ATLAS audit): single module-level poller shared by all chambers.
// Each chamber used to spin up its own `setInterval(60s)`; when multiple
// chambers mounted, their timers fired in close succession and produced a
// thundering-herd of snapshot calls at each 60s boundary. The `STALE_MS`
// de-dupe was a narrow race that didn't always win.
//
// With a shared singleton timer and a pub/sub subscriber set, we guarantee
// at most one fetch per interval regardless of how many chambers are
// mounted.
type Subscriber = (snapshot: TerminalSnapshot | null, error: string | null) => void;
const _subscribers = new Set<Subscriber>();
let _pollerTimer: ReturnType<typeof setInterval> | null = null;

function notify(snapshot: TerminalSnapshot | null, error: string | null) {
  for (const sub of _subscribers) {
    try {
      sub(snapshot, error);
    } catch {
      // swallow subscriber errors
    }
  }
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { cache: 'no-store', signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function isFullSnapshot(data: TerminalSnapshot): boolean {
  // A full snapshot always has `lanes` as an array. Lite has it as an object.
  return Array.isArray(data.lanes);
}

async function loadSnapshot(): Promise<TerminalSnapshot> {
  const now = Date.now();
  if (_cache && now - _lastFetch < STALE_MS) return _cache;
  if (_inflight) return _inflight;

  _inflight = (async () => {
    // Kick off lite + full in parallel on cold start so we get *something*
    // fast, but only promote lite to callers if the full never lands AND the
    // payload matches the full shape (it won't — this is a safety net).
    const fullPromise = (async () => {
      const res = await fetchWithTimeout('/api/terminal/snapshot', FULL_TIMEOUT_MS);
      if (!res.ok) throw new Error(`snapshot failed (${res.status})`);
      return (await res.json()) as TerminalSnapshot;
    })();

    try {
      const data = await fullPromise;
      data.lite = false;
      if (isFullSnapshot(data)) {
        _cache = data;
        _lastFetch = Date.now();
        _lastError = null;
        notify(_cache, null);
      }
      return data;
    } catch (err) {
      _lastError = err instanceof Error ? err.message : 'Snapshot load failed';
      if (_cache && isFullSnapshot(_cache)) {
        notify(_cache, _lastError);
        return _cache;
      }
      notify(null, _lastError);
      throw err;
    }
  })().finally(() => {
    _inflight = null;
  });

  return _inflight;
}

function ensurePoller() {
  if (_pollerTimer !== null) return;
  if (typeof window === 'undefined') return;
  _pollerTimer = setInterval(() => {
    if (_subscribers.size === 0) return;
    void loadSnapshot().catch(() => {});
  }, STALE_MS);
}

function subscribe(sub: Subscriber): () => void {
  _subscribers.add(sub);
  ensurePoller();
  return () => {
    _subscribers.delete(sub);
    // We intentionally keep the timer alive even when the subscriber set
    // drops to zero — chambers mount/unmount frequently during navigation,
    // and tearing down + recreating the timer is more expensive than one
    // idle tick that returns early.
  };
}

export function useTerminalSnapshot() {
  const [snapshot, setSnapshot] = useState<TerminalSnapshot | null>(_cache);
  const [loading, setLoading] = useState(!_cache);
  const [error, setError] = useState<string | null>(_lastError);

  useEffect(() => {
    let mounted = true;

    const unsubscribe = subscribe((snap, err) => {
      if (!mounted) return;
      setSnapshot(snap);
      setError(err);
      setLoading(false);
    });

    void loadSnapshot()
      .then((data) => {
        if (!mounted) return;
        if (isFullSnapshot(data)) {
          setSnapshot(data);
          setError(null);
        }
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Snapshot load failed');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  return { snapshot, loading, error };
}
