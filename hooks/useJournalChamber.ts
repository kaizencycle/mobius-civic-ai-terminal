'use client';

import { useMemo } from 'react';
import { useChamberHydration } from '@/hooks/useChamberHydration';

export type JournalChamberPayload = {
  ok: boolean;
  mode: 'hot' | 'canon' | 'merged';
  entries: unknown[];
  canonical_available: boolean;
  fallback: boolean;
  timestamp: string;
};

export function useJournalChamber(enabled: boolean, mode: 'hot' | 'canon' | 'merged', limit = 100) {
  const url = useMemo(() => `/api/chambers/journal?mode=${mode}&limit=${limit}`, [mode, limit]);
  return useChamberHydration<JournalChamberPayload>(url, enabled);
}
