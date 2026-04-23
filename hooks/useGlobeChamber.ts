'use client';

import { useChamberHydration } from '@/hooks/useChamberHydration';

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
  return useChamberHydration<GlobeChamberPayload>('/api/chambers/globe', enabled);
}
