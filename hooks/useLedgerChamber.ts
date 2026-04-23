'use client';

import { useChamberHydration } from '@/hooks/useChamberHydration';

export type LedgerChamberPayload = {
  ok: boolean;
  events: unknown[];
  candidates: { pending: number; confirmed: number; contested: number };
  fallback: boolean;
  timestamp: string;
};

export function useLedgerChamber(enabled: boolean) {
  return useChamberHydration<LedgerChamberPayload>('/api/chambers/ledger', enabled);
}
