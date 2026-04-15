'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import type { MicroAgentSweepResult } from '@/lib/agents/micro';
import type { EpiconItem } from '@/lib/terminal/types';
import type { SentimentDomainKey } from '@/lib/terminal/globePins';

type SentimentDomain = {
  key: SentimentDomainKey;
  label: string;
  agent: string;
  score: number | null;
  status: 'nominal' | 'stressed' | 'critical' | 'unknown';
};

export type GlobeChamberProps = {
  micro: (MicroAgentSweepResult & { ok?: boolean }) | null;
  echoEpicon: EpiconItem[];
  domains: SentimentDomain[];
  cycleId: string;
  clockLabel: string;
  giScore: number;
  miiScore: number | null;
};

const GlobeView = dynamic(() => import('./GlobeView3D'), {
  ssr: false,
  loading: () => (
    <div className="h-[min(72vh,640px)] w-full animate-pulse bg-[#020810] rounded-lg border border-slate-800" />
  ),
});

const WorldMapView = dynamic(() => import('./WorldMapView'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full animate-pulse bg-[#020810]" />
  ),
});

function useIsDesktop(breakpoint = 768): boolean {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= breakpoint);
    check();
    const mq = window.matchMedia(`(min-width: ${breakpoint}px)`);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [breakpoint]);
  return isDesktop;
}

export default function GlobeChamber(props: GlobeChamberProps) {
  const isDesktop = useIsDesktop(768);
  const [prefer2D, setPrefer2D] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('mobius-globe-prefer2d');
      if (saved === 'true') setPrefer2D(true);
    } catch { /* no-op */ }
  }, []);

  const toggle = () => {
    setPrefer2D((v) => {
      const next = !v;
      try { window.localStorage.setItem('mobius-globe-prefer2d', String(next)); } catch { /* no-op */ }
      return next;
    });
  };

  const show3D = isDesktop && !prefer2D;

  return (
    <div className="relative">
      {isDesktop ? (
        <button
          type="button"
          onClick={toggle}
          className="absolute right-3 top-3 z-30 rounded border border-slate-600 bg-slate-900/90 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-slate-300 backdrop-blur-sm transition hover:border-cyan-500/50 hover:text-cyan-200"
        >
          {show3D ? '2D Map' : '3D Globe'}
        </button>
      ) : null}
      {show3D ? <GlobeView {...props} /> : <WorldMapView {...props} />}
    </div>
  );
}
