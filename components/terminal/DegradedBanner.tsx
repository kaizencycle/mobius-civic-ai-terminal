'use client';

import { useCallback, useEffect, useState } from 'react';
import type { GISourceDisplay } from '@/lib/gi/resolveGiChain';
import type { MemoryModePayload } from '@/lib/terminal/memoryMode';

const SESSION_KEY = 'mobius_c287_degraded_banner_dismissed';

function formatAge(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return 'unknown';
  if (sec < 120) return `${Math.round(sec)}s`;
  return `${Math.round(sec / 60)}min`;
}

function message(m: MemoryModePayload): string {
  const prov = (m.gi_provenance ?? '') as GISourceDisplay;
  const kvOk = m.kv_available !== false;
  const backup = Boolean(m.backup_redis_available);

  if (!m.lite_ok) {
    return 'Verified Memory snapshot unavailable · header may reflect integrity lane only';
  }
  if (!kvOk && !backup) {
    return 'Primary KV unavailable · backup Redis offline · OAA bridge may apply for continuity reads';
  }
  if (!kvOk && backup) {
    return 'Primary KV unavailable · backup Redis active · continuity reads preserved where mirrored';
  }
  if (prov === 'live-compute') {
    return 'GI from live compute (KV gi:latest stale) · value is real-time, not cached KV';
  }
  if (prov === 'oaa-verified') {
    return 'GI from OAA warm-tier mirror · KV row stale or missing';
  }
  if (prov === 'readiness-fallback') {
    return `GI from readiness cache · age ${formatAge(m.gi_age_seconds)}`;
  }
  if (prov === 'kv-carry') {
    return 'GI from KV carry-forward row · primary gi:latest stale';
  }
  if (prov === 'unknown') {
    return 'GI unavailable from all recorded tiers · operator truth: no estimate';
  }
  return 'Terminal in degraded read mode · check lane diagnostics';
}

export function DegradedBanner({ memoryMode }: { memoryMode: MemoryModePayload | null | undefined }) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(SESSION_KEY) === '1') setDismissed(true);
    } catch {
      /* private mode */
    }
  }, []);

  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      sessionStorage.setItem(SESSION_KEY, '1');
    } catch {
      /* ignore */
    }
  }, []);

  if (!memoryMode || memoryMode.degraded !== true || dismissed) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-between gap-2 border-b border-amber-500/30 bg-amber-950/50 px-3 py-1.5 text-[11px] text-amber-100/95 md:px-4"
    >
      <div className="min-w-0 flex-1">
        <span className="mr-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400 align-middle" aria-hidden />
        <span className="align-middle">{message(memoryMode)}</span>
      </div>
      <button
        type="button"
        onClick={dismiss}
        className="shrink-0 rounded border border-amber-500/40 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-200/90 hover:bg-amber-500/10"
      >
        Dismiss
      </button>
    </div>
  );
}
