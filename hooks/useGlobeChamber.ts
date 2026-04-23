'use client';

import { useMemo } from 'react';
import { useChamberHydration } from '@/hooks/useChamberHydration';
import { useEchoDigest } from '@/hooks/useEchoDigest';
import { useTerminalSnapshot } from '@/hooks/useTerminalSnapshot';

export type GlobeChamberPayload = {
  ok: boolean;
  fallback: boolean;
  cycle: string;
  gi: number | null;
  micro: unknown;
  echo: unknown;
  sentiment: unknown;
  timestamp: string;
};

export function useGlobeChamber(enabled: boolean) {
  const { snapshot } = useTerminalSnapshot();
  const { digest } = useEchoDigest(enabled);
  const preview = useMemo(() => ({
    ok: true,
    fallback: true,
    cycle: digest?.cycle ?? snapshot?.cycle ?? 'C-—',
    gi: snapshot?.gi ?? null,
    micro: snapshot?.signals?.data ?? null,
    echo: {
      epicon: [],
      digest: {
        headline: digest?.summary.headline ?? null,
        top_warnings: digest?.summary.top_warnings ?? [],
      },
    },
    sentiment: snapshot?.sentiment?.data ?? null,
    timestamp: digest?.timestamp ?? snapshot?.timestamp ?? new Date().toISOString(),
  } satisfies GlobeChamberPayload), [digest, snapshot]);

  return useChamberHydration<GlobeChamberPayload>('/api/chambers/globe', enabled, { previewData: preview });
}
