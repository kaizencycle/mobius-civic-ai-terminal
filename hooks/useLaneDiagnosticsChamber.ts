'use client';

import { useMemo } from 'react';
import { useChamberHydration } from '@/hooks/useChamberHydration';
import { useEchoDigest } from '@/hooks/useEchoDigest';
import { useTerminalSnapshot } from '@/hooks/useTerminalSnapshot';

export type LaneDiagnosticsPayload = {
  ok: boolean;
  degraded: boolean;
  lanes: Record<string, unknown>;
  tripwire: { count: number; elevated: boolean };
  heartbeat: { runtime: string | null; journal: string | null };
  reason: string | null;
  timestamp: string;
  fallback?: boolean;
};

function laneFromDigest(digest: ReturnType<typeof useEchoDigest>['digest']) {
  return {
    kv: { freshness: 'unknown', state: 'unknown', message: 'KV lane status pending hydration' },
    backup_redis: { freshness: 'unknown', state: 'unknown', message: 'BACKUP_REDIS lane status pending hydration' },
    tripwire: {
      freshness: digest?.degraded ? 'degraded' : 'nominal',
      state: digest?.degraded ? 'degraded' : 'nominal',
      message: digest?.signals_preview.anomalies ? 'Tripwire watch signals present' : 'Tripwire nominal',
      count: digest?.signals_preview.anomalies ?? 0,
      elevated: digest?.degraded ?? false,
    },
    integrity: {
      freshness: digest?.degraded ? 'degraded' : 'fresh',
      state: digest?.degraded ? 'degraded' : 'healthy',
      message: `GI ${typeof digest?.integrity.gi === 'number' ? digest.integrity.gi.toFixed(2) : '—'} from digest`,
    },
    signals: {
      freshness: digest?.signals_preview.freshness ?? 'unknown',
      state: digest?.signals_preview.freshness ?? 'unknown',
      message: `Signals preview instruments ${digest?.signals_preview.instrument_count ?? 0}`,
    },
  } as Record<string, unknown>;
}

export function useLaneDiagnosticsChamber(enabled: boolean) {
  const { snapshot } = useTerminalSnapshot();
  const { digest } = useEchoDigest(enabled);

  const preview = useMemo(() => ({
    ok: true,
    degraded: Boolean(digest?.degraded),
    lanes: laneFromDigest(digest),
    tripwire: {
      count: digest?.signals_preview.anomalies ?? 0,
      elevated: Boolean(digest?.degraded),
    },
    heartbeat: {
      runtime: null,
      journal: null,
    },
    reason: digest?.degraded ? 'digest indicates degraded state' : null,
    timestamp: digest?.timestamp ?? snapshot?.timestamp ?? new Date().toISOString(),
    fallback: true,
  } satisfies LaneDiagnosticsPayload), [digest, snapshot]);

  return useChamberHydration<LaneDiagnosticsPayload>('/api/chambers/lane-diagnostics', enabled, { pollMs: 20_000, previewData: preview });
}
