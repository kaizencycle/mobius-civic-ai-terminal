import type { MicroSignal } from './core';

type WaybackAvailableResponse = {
  url?: string;
  archived_snapshots?: {
    closest?: {
      status?: string;
      available?: boolean;
      url?: string;
      timestamp?: string;
    };
  };
};

function parseArchiveSignal(data: WaybackAvailableResponse): MicroSignal | null {
  const closest = data?.archived_snapshots?.closest;
  if (!closest) return null;
  const available = closest.available === true;
  const timestamp = closest.timestamp;
  const snapshotAge = timestamp
    ? Math.floor((Date.now() - new Date(
        timestamp.replace(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/, '$1-$2-$3T$4:$5:$6Z'),
      ).getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const value = available
    ? snapshotAge !== null && snapshotAge <= 30 ? 0.9 : 0.7
    : 0.4;
  const label = available
    ? `Wayback Machine: snapshot available${snapshotAge !== null ? ` (${snapshotAge}d ago)` : ''}`
    : 'Wayback Machine: no snapshot available';
  return {
    agentName: 'JADE-µ4',
    source: 'Internet Archive · Wayback Machine',
    timestamp: new Date().toISOString(),
    value,
    label,
    severity: value >= 0.7 ? 'nominal' : value >= 0.5 ? 'watch' : 'elevated',
    raw: { available, snapshot_timestamp: timestamp, age_days: snapshotAge },
  };
}

export async function jadeInternetArchiveMicro(): Promise<MicroSignal | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(
      'https://archive.org/wayback/available?url=mobius-civic-ai-terminal.vercel.app',
      {
        method: 'GET',
        signal: controller.signal,
        headers: { 'User-Agent': 'Mobius-JADE/1.0 (civic-integrity-monitor)' },
      },
    );
    clearTimeout(timeout);
    if (!res.ok) {
      console.warn(`[micro] JADE-µ4 Internet Archive: non-OK ${res.status}`);
      return null;
    }
    const data = (await res.json()) as WaybackAvailableResponse;
    return parseArchiveSignal(data);
  } catch (err: unknown) {
    const e = err as { name?: string; message?: string } | null;
    if (e?.name === 'AbortError') {
      console.warn('[micro] JADE-µ4 Internet Archive: timed out after 5s — skipping signal');
    } else {
      console.warn(`[micro] JADE-µ4 Internet Archive: fetch failed — ${e?.message ?? 'unknown error'}`);
    }
    return null;
  }
}
