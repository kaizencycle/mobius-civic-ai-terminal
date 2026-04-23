"use client";

import { useState, useEffect, useCallback } from "react";

export type KVStatus = "live" | "degraded" | "unknown";

export interface SystemStatus {
  heartbeatAt: Date | null;
  heartbeatAgo: string;
  cycle: string | null;
  kvStatus: KVStatus;
  runtimeGuarded: boolean;
}

const STALE_THRESHOLD_MS = 10 * 60 * 1000;
const POLL_MS = 60_000;

function formatAgo(date: Date | null): string {
  if (!date) return "—";
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return "just now";
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

function inferKVStatus(date: Date | null): KVStatus {
  if (!date) return "unknown";
  return Date.now() - date.getTime() > STALE_THRESHOLD_MS ? "degraded" : "live";
}

export function useSystemStatus(apiBase?: string): SystemStatus {
  const base = apiBase ?? process.env.NEXT_PUBLIC_MOBIUS_API_BASE ?? "";

  const [hbAt, setHbAt] = useState<Date | null>(null);
  const [cycle, setCycle] = useState<string | null>(null);
  const [, tick] = useState(0);

  const fetchHeartbeat = useCallback(async () => {
    try {
      const res = await fetch(`${base}/api/v1/system/heartbeat`, {
        next: { revalidate: 0 },
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.heartbeat_at) {
        setHbAt(new Date(data.heartbeat_at));
      }
      if (data.cycle) setCycle(data.cycle);
    } catch {
      // no-op
    }
  }, [base]);

  useEffect(() => {
    fetchHeartbeat();
    const fetchId = setInterval(fetchHeartbeat, POLL_MS);
    const tickId = setInterval(() => tick((n) => n + 1), 30_000);
    return () => {
      clearInterval(fetchId);
      clearInterval(tickId);
    };
  }, [fetchHeartbeat]);

  const kvStatus = inferKVStatus(hbAt);

  return {
    heartbeatAt: hbAt,
    heartbeatAgo: formatAgo(hbAt),
    cycle,
    kvStatus,
    runtimeGuarded: true,
  };
}
