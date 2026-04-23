'use client';

import { useEffect, useState } from 'react';

export type ShellSnapshot = {
  ok: boolean;
  fallback: boolean;
  cycle: string;
  gi: number | null;
  mode: string | null;
  degraded: boolean;
  tripwire: { count: number; elevated: boolean };
  heartbeat: { runtime: string | null; journal: string | null };
  source: 'live' | 'fallback';
  timestamp: string;
};

const POLL_MS = 30_000;

function readSeed(): ShellSnapshot | null {
  if (typeof window === 'undefined') return null;
  const seed = (window as Window & { __MOBIUS_SHELL_SEED__?: ShellSnapshot }).__MOBIUS_SHELL_SEED__;
  if (!seed || typeof seed !== 'object') return null;
  return seed;
}

export function useShellSnapshot() {
  const [shell, setShell] = useState<ShellSnapshot | null>(() => readSeed());
  const [loading, setLoading] = useState(shell === null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const res = await fetch('/api/terminal/shell', { cache: 'no-store' });
        const json = (await res.json()) as ShellSnapshot;
        if (!mounted) return;
        setShell(json);
        setError(null);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Shell snapshot load failed');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void load();
    const id = window.setInterval(load, POLL_MS);
    return () => {
      mounted = false;
      window.clearInterval(id);
    };
  }, []);

  return { shell, loading, error };
}
