'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { EchoDigestPayload } from '@/lib/echo/buildDigest';

type EchoDigestContextValue = {
  digest: EchoDigestPayload | null;
  loading: boolean;
  error: string | null;
};

const POLL_MS = 20_000;
const EchoDigestContext = createContext<EchoDigestContextValue | null>(null);

export function EchoDigestProvider({ children }: { children: ReactNode }) {
  const [digest, setDigest] = useState<EchoDigestPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

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
  }, []);

  const value = useMemo(() => ({ digest, loading, error }), [digest, loading, error]);

  return <EchoDigestContext.Provider value={value}>{children}</EchoDigestContext.Provider>;
}

export function useEchoDigestContext() {
  return useContext(EchoDigestContext);
}
