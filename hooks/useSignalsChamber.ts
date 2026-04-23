'use client';

import { useChamberHydration } from '@/hooks/useChamberHydration';

export type SignalsChamberPayload = {
  ok: boolean;
  fallback: boolean;
  families: Array<{ name: string; healthy: boolean; count: number }>;
  anomalies: Array<{ agentName: string; source: string; severity: string; label: string }>;
  composite: number | null;
  last_sweep: string | null;
  raw: unknown;
  timestamp: string;
};

export function useSignalsChamber(enabled: boolean) {
  return useChamberHydration<SignalsChamberPayload>('/api/chambers/signals', enabled);
}
