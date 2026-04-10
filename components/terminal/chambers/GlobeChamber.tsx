'use client';

import dynamic from 'next/dynamic';
import { useIsMobile } from '@/lib/terminal/useIsMobile';
import type { GlobeChamberProps } from './types';

const GlobeView = dynamic(() => import('./GlobeView'), {
  ssr: false,
  loading: () => <div className="h-[min(72vh,640px)] w-full animate-pulse bg-[#020408]" />,
});

const WorldMapView = dynamic(() => import('./WorldMapView'), {
  ssr: false,
  loading: () => <div className="h-[min(72vh,640px)] w-full animate-pulse bg-[#020408]" />,
});

export default function GlobeChamber(props: GlobeChamberProps) {
  const isMobile = useIsMobile(768);

  return isMobile ? <WorldMapView {...props} /> : <GlobeView {...props} />;
}
