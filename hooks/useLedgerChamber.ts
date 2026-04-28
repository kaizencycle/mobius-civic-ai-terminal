'use client';

import { useCallback, useMemo } from 'react';
import { useChamberHydration } from '@/hooks/useChamberHydration';
import { useEchoDigest } from '@/hooks/useEchoDigest';
import { useTerminalSnapshot } from '@/hooks/useTerminalSnapshot';
import { currentCycleId } from '@/lib/eve/cycle-engine';
import type { LedgerEntry } from '@/lib/terminal/types';

export type LedgerCanonCounts = {
  hot: number;
  candidate: number;
  attested: number;
  sealed: number;
  blocked: number;
};

export type LedgerPagination = {
  maxRows: number;
  pageSize: number;
  pages: number;
};

export type LedgerChamberPayload = {
  ok: boolean;
  cycleId?: string;
  events: LedgerEntry[];
  candidates: { pending: number; confirmed: number; contested: number };
  canon?: LedgerCanonCounts;
  pagination?: LedgerPagination;
  fallback: boolean;
  timestamp: string;
  savepoint?: {
    status: 'live' | 'saved' | 'none';
    saved_at: string | null;
    saved_count: number;
    live_count: number;
    reason: string | null;
  };
};

const EMPTY_CANON: LedgerCanonCounts = { hot: 0, candidate: 0, attested: 0, sealed: 0, blocked: 0 };
const PREVIEW_PAGINATION: LedgerPagination = { maxRows: 300, pageSize: 100, pages: 3 };

export function useLedgerChamber(enabled: boolean) {
  const { snapshot } = useTerminalSnapshot();
  const { digest } = useEchoDigest(enabled);
  const stabilizationActive = digest?.predictive.risk_level === 'elevated' || digest?.predictive.risk_level === 'critical';
  const getSavepointCount = useCallback((payload: LedgerChamberPayload) => Array.isArray(payload.events) ? payload.events.length : 0, []);

  const preview = useMemo(() => {
    const epicon = snapshot?.epicon?.data as { items?: Array<Record<string, unknown>> } | undefined;
    const items = Array.isArray(epicon?.items) ? epicon.items : [];
    const activeCycle = digest?.cycle ?? snapshot?.cycle ?? 'C-—';
    const fallbackRows = Math.max(digest?.ledger_preview.pending ?? 0, items.length, 1);
    const events: LedgerEntry[] = items.slice(0, 20).map((item, idx) => ({
      id: typeof item.id === 'string' ? item.id : `snapshot-${idx}`,
      cycleId: typeof item.cycle === 'string' ? item.cycle : activeCycle,
      type: 'epicon',
      agentOrigin: typeof item.agentOrigin === 'string' ? item.agentOrigin : 'ECHO',
      timestamp: typeof item.timestamp === 'string' ? item.timestamp : (digest?.timestamp ?? snapshot?.timestamp ?? new Date().toISOString()),
      title: typeof item.title === 'string' ? item.title : undefined,
      summary: typeof item.summary === 'string' ? item.summary : 'Digest preview event',
      integrityDelta: 0,
      status: 'pending',
      statusReason: 'preview_snapshot_pending_verification',
      proofSource: 'snapshot_preview',
      canonState: 'hot',
      category: undefined,
      confidenceTier: typeof item.confidenceTier === 'number' ? item.confidenceTier : undefined,
      source: 'echo',
    }));

    if (events.length === 0) {
      for (let i = 0; i < fallbackRows; i += 1) {
        events.push({
          id: `digest-${i}`,
          cycleId: activeCycle,
          type: 'epicon',
          agentOrigin: 'ECHO',
          timestamp: digest?.timestamp ?? new Date().toISOString(),
          summary: 'Digest preview row',
          integrityDelta: 0,
          status: 'pending',
          statusReason: 'digest_preview_pending_verification',
          proofSource: 'echo_digest',
          canonState: 'hot',
          source: 'echo',
        });
      }
    }

    return {
      ok: true,
      cycleId: activeCycle,
      events,
      candidates: {
        pending: digest?.ledger_preview.pending ?? events.length,
        confirmed: digest?.ledger_preview.promoted ?? 0,
        contested: digest?.ledger_preview.contested ?? 0,
      },
      canon: { ...EMPTY_CANON, hot: events.length },
      pagination: PREVIEW_PAGINATION,
      fallback: true,
      timestamp: digest?.timestamp ?? snapshot?.timestamp ?? new Date().toISOString(),
    } satisfies LedgerChamberPayload;
  }, [digest, snapshot]);

  // Include cycle in savepoint key so a C-293 savepoint (300 rows) can never beat
  // a C-295 live response (fewer rows on cold start) and show the wrong cycle label.
  const savepointKey = `ledger:all:300:3-pages:${currentCycleId()}`;

  return useChamberHydration<LedgerChamberPayload>('/api/chambers/ledger', enabled, {
    previewData: preview,
    lockToPreview: stabilizationActive,
    savepointKey,
    getSavepointCount,
  });
}
