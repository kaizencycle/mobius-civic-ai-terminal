'use client';

import { useMemo } from 'react';
import { useChamberHydration } from '@/hooks/useChamberHydration';
import { useTerminalSnapshot } from '@/hooks/useTerminalSnapshot';

export type GlobeChamberPayload = {
  ok: boolean;
  fallback: boolean;
  cycle: string;
  micro: unknown;
  echo: unknown;
  sentiment: unknown;
  timestamp: string;
};

export function useGlobeChamber(enabled: boolean) {
  const { snapshot } = useTerminalSnapshot();
  const preview = useMemo(() => ({
    ok: true,
    fallback: true,
    cycle: snapshot?.cycle ?? 'C-—',
    micro: snapshot?.signals?.data ?? null,
    echo: snapshot?.echo?.data ?? null,
    sentiment: snapshot?.sentiment?.data ?? null,
    timestamp: snapshot?.timestamp ?? new Date().toISOString(),
  } satisfies GlobeChamberPayload), [snapshot]);

  return useChamberHydration<GlobeChamberPayload>('/api/chambers/globe', enabled, { previewData: preview });
}
