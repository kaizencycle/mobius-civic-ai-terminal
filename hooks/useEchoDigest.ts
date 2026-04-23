'use client';

import { useEffect, useState } from 'react';
import type { EchoDigestPayload } from '@/lib/echo/buildDigest';

const POLL_MS = 20_000;

export function useEchoDigest(enabled = true) {
  const [digest, setDigest] = useState<EchoDigestPayload | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    if (!enabled) {
      setLoading(false);
      return () => {
        mounted = false;
      };
    }

    async function load() {
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
    const id = window.setInterval(load, POLL_MS);
    return () => {
      mounted = false;
      window.clearInterval(id);
    };
  }, [enabled]);

  return { digest, loading, error };
}
