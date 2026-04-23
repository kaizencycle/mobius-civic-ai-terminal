'use client';

import { useChamberHydration } from '@/hooks/useChamberHydration';

export type LaneDiagnosticsPayload = {
  ok: boolean;
  degraded: boolean;
  lanes: Record<string, unknown>;
  tripwire: { count: number; elevated: boolean };
  heartbeat: { runtime: string | null; journal: string | null };
  reason: string | null;
  timestamp: string;
};

export function useLaneDiagnosticsChamber(enabled: boolean) {
  return useChamberHydration<LaneDiagnosticsPayload>('/api/chambers/lane-diagnostics', enabled, 20_000);
}
