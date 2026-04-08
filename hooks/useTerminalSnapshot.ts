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
  journal?: SnapshotLeaf;
  sentiment?: SnapshotLeaf;
  runtime?: SnapshotLeaf;
  promotion?: SnapshotLeaf;
  eve?: SnapshotLeaf;
  substrate?: unknown;
};

let cachedSnapshot: TerminalSnapshot | null = null;
let cachedAt = 0;
let inflight: Promise<TerminalSnapshot> | null = null;

const TTL_MS = 60_000;

async function fetchSnapshot(): Promise<TerminalSnapshot> {
  const now = Date.now();
  if (cachedSnapshot && now - cachedAt < TTL_MS) return cachedSnapshot;
  if (inflight) return inflight;

  inflight = fetch('/api/terminal/snapshot', { cache: 'no-store' })
    .then(async (res) => {
      if (!res.ok) throw new Error(`snapshot failed (${res.status})`);
      const json = (await res.json()) as TerminalSnapshot;
      cachedSnapshot = json;
      cachedAt = Date.now();
      return json;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

export function useTerminalSnapshot() {
  const [snapshot, setSnapshot] = useState<TerminalSnapshot | null>(cachedSnapshot);
  const [loading, setLoading] = useState(!cachedSnapshot);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const next = await fetchSnapshot();
        if (!alive) return;
        setSnapshot(next);
      } finally {
        if (alive) setLoading(false);
      }
    };

    void load();
    const interval = window.setInterval(() => {
      void load();
    }, TTL_MS);

    return () => {
      alive = false;
      window.clearInterval(interval);
    };
  }, []);

  return { snapshot, loading };
}
