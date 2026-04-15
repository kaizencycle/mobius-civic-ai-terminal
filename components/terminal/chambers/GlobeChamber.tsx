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

// 3D Three.js globe — desktop only, never ships to mobile
const GlobeView = dynamic(() => import('./GlobeView3D'), {
  ssr: false,
  loading: () => (
    <div className="h-[min(72vh,640px)] w-full animate-pulse bg-[#020408] rounded-lg border border-slate-800" />
  ),
});

// Flat SVG map — mobile only
const WorldMapView = dynamic(() => import('./WorldMapView'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full animate-pulse bg-[#020408]" />
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
  return isDesktop ? <GlobeView {...props} /> : <WorldMapView {...props} />;
}
