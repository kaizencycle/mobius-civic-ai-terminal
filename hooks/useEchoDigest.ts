'use client';

import { useEffect, useState } from 'react';
import type { EchoDigestPayload } from '@/lib/echo/buildDigest';
import { useEchoDigestContext } from '@/components/terminal/EchoDigestProvider';

const POLL_MS = 20_000;

export function useEchoDigest(enabled = true) {
  const context = useEchoDigestContext();
  const [digest, setDigest] = useState<EchoDigestPayload | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (context || !enabled) return;
    let mounted = true;

    async function load() {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      try {
        const res = await fetch('/api/echo/digest', { cache: 'no-store' });
        const json = (await res.json()) as EchoDigestPayload;
        if (!mounted) return;
        setDigest(json);
        setError(null);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Echo digest load failed');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void load();
    let intervalId: number | null = null;
    const arm = () => {
      if (intervalId !== null) window.clearInterval(intervalId);
      intervalId = null;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void load();
      intervalId = window.setInterval(() => void load(), POLL_MS);
    };
    arm();
    const onVis = () => {
      if (document.visibilityState === 'visible') arm();
      else if (intervalId !== null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      mounted = false;
      document.removeEventListener('visibilitychange', onVis);
      if (intervalId !== null) window.clearInterval(intervalId);
    };
  }, [enabled, context]);

  if (!enabled) {
    return { digest: null, loading: false, error: null };
  }

  if (context) {
    return context;
  }

  return { digest, loading, error };
}
