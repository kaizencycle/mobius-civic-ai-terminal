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
const LAST_KNOWN_KEY = 'mobius:shell:last-known';

function readSeed(): ShellSnapshot | null {
  if (typeof window === 'undefined') return null;
  const seed = (window as Window & { __MOBIUS_SHELL_SEED__?: ShellSnapshot }).__MOBIUS_SHELL_SEED__;
  if (!seed || typeof seed !== 'object') return null;
  return seed;
}

function readLastKnown(): ShellSnapshot | null {
  try {
    const raw = sessionStorage.getItem(LAST_KNOWN_KEY);
    return raw ? (JSON.parse(raw) as ShellSnapshot) : null;
  } catch {
    return null;
  }
}

function saveLastKnown(snapshot: ShellSnapshot) {
  try {
    sessionStorage.setItem(LAST_KNOWN_KEY, JSON.stringify(snapshot));
  } catch {}
}

export function useShellSnapshot() {
  // P2 fix (C-321): distinguish live-fresh from cached init. readSeed() is SSR-injected
  // (live at render time); readLastKnown() is sessionStorage (stale from prior load).
  const [shell, setShell] = useState<ShellSnapshot | null>(() => readSeed() ?? readLastKnown());
  const [loading, setLoading] = useState(shell === null);
  const [error, setError] = useState<string | null>(null);
  // liveLoaded becomes true after the first successful fetch from the server.
  // Until then, any value we're showing came from SSR seed or sessionStorage cache.
  const [liveLoaded, setLiveLoaded] = useState(() => {
    // SSR seed is live — mark as already-loaded so header doesn't show ~ on first paint.
    return readSeed() !== null;
  });

  useEffect(() => {
    let mounted = true;

    // OPT-3 (C-321): retry with backoff on cold-start failure so a 5s serverless
    // wake-up doesn't strand the header at "—boot—" for the full session.
    async function load(attempt = 0): Promise<void> {
      const RETRY_DELAYS = [0, 600, 1400, 3000];
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 6_000);
      try {
        const res = await fetch('/api/terminal/shell', {
          cache: 'no-store',
          signal: controller.signal,
        });
        const json = (await res.json()) as ShellSnapshot;
        if (!mounted) return;
        if (json?.gi !== undefined && json?.gi !== null) {
          saveLastKnown(json);
        }
        setShell(json);
        setLiveLoaded(true);
        setError(null);
      } catch (err) {
        if (!mounted) return;
        const nextAttempt = attempt + 1;
        if (nextAttempt < RETRY_DELAYS.length) {
          window.setTimeout(() => void load(nextAttempt), RETRY_DELAYS[nextAttempt]);
          return;
        }
        setError(err instanceof Error ? err.message : 'Shell snapshot load failed');
      } finally {
        window.clearTimeout(timeoutId);
        if (mounted) setLoading(false);
      }
    }

    void load();
    const id = window.setInterval(() => void load(), POLL_MS);
    return () => {
      mounted = false;
      window.clearInterval(id);
    };
  }, []);

  // stale = we have a GI value but it hasn't been confirmed by a live fetch yet.
  const stale = !liveLoaded && shell?.gi != null;

  return { shell, loading, error, stale };
}
