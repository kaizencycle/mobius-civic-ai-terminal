'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import GlobeChapterDashboards from '@/components/terminal/chambers/GlobeChapterDashboards';
import type { GlobeChamberProps, GlobeViewControls } from '@/components/terminal/chambers/types';

const GlobeView = dynamic(() => import('./GlobeView3D'), {
  ssr: false,
  loading: () => (
    <div className="h-[min(72vh,640px)] w-full animate-pulse rounded-lg border border-slate-800 bg-[#020810]" />
  ),
});

const WorldMapView = dynamic(() => import('./WorldMapView'), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-[#020810]" />,
});

const LS_PREFER_2D = 'mobius-globe-prefer2d';
const LS_MOBILE_3D = 'mobius-globe-mobile-3d';

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

function persistMobile3d(on: boolean) {
  try {
    window.localStorage.setItem(LS_MOBILE_3D, String(on));
  } catch {
    /* no-op */
  }
}

export default function GlobeChamber(props: GlobeChamberProps) {
  const isDesktop = useIsDesktop(768);
  const [prefer2D, setPrefer2D] = useState(false);
  const [mobileShowGlobe, setMobileShowGlobe] = useState(false);
  const globeControlsRef = useRef<GlobeViewControls | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LS_PREFER_2D);
      if (saved === 'true') setPrefer2D(true);
    } catch {
      /* no-op */
    }
  }, []);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(LS_MOBILE_3D) === 'true') setMobileShowGlobe(true);
    } catch {
      /* no-op */
    }
  }, []);

  const toggleDesktop2d = () => {
    setPrefer2D((v) => {
      const next = !v;
      try {
        window.localStorage.setItem(LS_PREFER_2D, String(next));
      } catch {
        /* no-op */
      }
      return next;
    });
  };

  const show3D = isDesktop ? !prefer2D : mobileShowGlobe;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col space-y-0">
      {isDesktop ? (
        <button
          type="button"
          onClick={toggleDesktop2d}
          className="absolute right-3 top-3 z-30 rounded border border-slate-600 bg-slate-900/90 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-slate-300 backdrop-blur-sm transition hover:border-cyan-500/50 hover:text-cyan-200"
        >
          {show3D ? '2D Map' : '3D Globe'}
        </button>
      ) : (
        <div className="sticky top-0 z-30 flex shrink-0 items-center justify-end gap-2 border-b border-white/[0.08] bg-[#020810]/95 px-2 py-2 backdrop-blur-sm">
          <div
            className="inline-flex rounded-full border border-slate-700 bg-slate-900/90 p-0.5 font-mono text-[10px] uppercase tracking-[0.08em]"
            role="group"
            aria-label="Map or 3D globe"
          >
            <button
              type="button"
              onClick={() => {
                setMobileShowGlobe(false);
                persistMobile3d(false);
              }}
              className={`rounded-full px-3 py-1.5 transition ${
                !mobileShowGlobe
                  ? 'border border-cyan-500/40 bg-cyan-500/20 text-cyan-100'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              aria-pressed={!mobileShowGlobe}
            >
              ▦ Map
            </button>
            <button
              type="button"
              onClick={() => {
                setMobileShowGlobe(true);
                persistMobile3d(true);
              }}
              className={`rounded-full px-3 py-1.5 transition ${
                mobileShowGlobe
                  ? 'border border-cyan-500/40 bg-cyan-500/20 text-cyan-100'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              aria-pressed={mobileShowGlobe}
            >
              ◎ Globe
            </button>
          </div>
        </div>
      )}
      <div className="min-h-0 shrink-0">
        {show3D ? (
          <GlobeView {...props} globeControlsRef={globeControlsRef} />
        ) : (
          <WorldMapView {...props} />
        )}
      </div>
      <GlobeChapterDashboards
        micro={props.micro}
        domains={props.domains}
        dashboard={props.globeDashboard ?? null}
        globeControlsRef={globeControlsRef}
        globeVisible={show3D}
      />
    </div>
  );
}
