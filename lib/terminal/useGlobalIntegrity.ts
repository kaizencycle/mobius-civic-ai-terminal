"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export type GIStatus = "live" | "stale" | "offline";

export interface GISnapshot {
  score: number;
  delta: number;
  cycle: string;
  timestamp: string;
  status: GIStatus;
  components?: {
    institutional_trust: number;
    info_reliability: number;
    consensus_stability: number;
  };
}

interface UseGlobalIntegrityOptions {
  pollMs?: number;
  apiBase?: string;
}

function resolveSeed(): GISnapshot {
  const raw = process.env.NEXT_PUBLIC_GI_SEED;
  const score = raw ? parseFloat(raw) : 0.72;
  return {
    score: Number.isFinite(score) ? Math.min(1, Math.max(0, score)) : 0.72,
    delta: 0,
    cycle: process.env.NEXT_PUBLIC_GI_SEED_CYCLE ?? "—",
    timestamp: new Date(0).toISOString(),
    status: "offline",
  };
}

export function useGlobalIntegrity(opts: UseGlobalIntegrityOptions = {}) {
  const {
    pollMs = 30_000,
    apiBase = process.env.NEXT_PUBLIC_MOBIUS_API_BASE ?? "",
  } = opts;

  const [gi, setGi] = useState<GISnapshot>(resolveSeed);
  const [loading, setLoading] = useState(true);
  const prevScoreRef = useRef<number>(gi.score);
  const abortRef = useRef<AbortController | null>(null);

  const fetchGI = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const res = await fetch(`${apiBase}/api/v1/integrity/current`, {
        signal: ac.signal,
        next: { revalidate: 0 },
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      const score = typeof data.score === "number" ? data.score : parseFloat(data.score ?? "0");
      const prev = prevScoreRef.current;
      prevScoreRef.current = score;

      setGi({
        score,
        delta: score - prev,
        cycle: data.cycle ?? data.epicon_cycle ?? "—",
        timestamp: data.timestamp ?? new Date().toISOString(),
        status: "live",
        components: data.components,
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      setGi((prev) => ({
        ...prev,
        status: prev.status === "live" ? "stale" : "offline",
      }));
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    fetchGI();
    const id = setInterval(fetchGI, pollMs);
    return () => {
      clearInterval(id);
      abortRef.current?.abort();
    };
  }, [fetchGI, pollMs]);

  return { gi, loading, refresh: fetchGI };
}
