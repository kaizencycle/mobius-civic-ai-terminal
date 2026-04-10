'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GlobeChamberProps } from './types';

type EONETCategory = 'wildfires' | 'severeStorms' | 'volcanoes' | 'floods' | 'earthquakes' | 'drought' | 'other';

interface EONETEvent {
  id: string;
  title: string;
  category: EONETCategory;
  lng: number;
  lat: number;
  date: string;
}

const CAT_COLOR: Record<EONETCategory, string> = {
  wildfires: '#f97316',
  severeStorms: '#60a5fa',
  volcanoes: '#f43f5e',
  floods: '#38bdf8',
  earthquakes: '#a78bfa',
  drought: '#fbbf24',
  other: '#94a3b8',
};

const CAT_LABEL: Record<EONETCategory, string> = {
  wildfires: 'Wildfire',
  severeStorms: 'Storm',
  volcanoes: 'Volcano',
  floods: 'Flood',
  earthquakes: 'Quake',
  drought: 'Drought',
  other: 'Event',
};

function resolveCategory(cats: { id: string }[]): EONETCategory {
  const ids = cats.map((c) => c.id.toLowerCase());
  if (ids.some((i) => i.includes('wildfire'))) return 'wildfires';
  if (ids.some((i) => i.includes('storm') || i.includes('cyclone'))) return 'severeStorms';
  if (ids.some((i) => i.includes('volcan'))) return 'volcanoes';
  if (ids.some((i) => i.includes('flood'))) return 'floods';
  if (ids.some((i) => i.includes('quake') || i.includes('seismic'))) return 'earthquakes';
  if (ids.some((i) => i.includes('drought'))) return 'drought';
  return 'other';
}

async function fetchEONET(): Promise<EONETEvent[]> {
  const res = await fetch('https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=80&days=30');
  if (!res.ok) throw new Error(`EONET ${res.status}`);
  const data: { events?: unknown[] } = await res.json();
  return (data.events ?? []).flatMap((raw) => {
    const ev = raw as {
      id?: string;
      title?: string;
      categories?: { id: string }[];
      geometry?: { coordinates?: [number, number]; date?: string }[];
    };
    const geo = ev.geometry?.[0];
    if (!geo?.coordinates) return [];
    const [lng, lat] = geo.coordinates;
    if (typeof lng !== 'number' || typeof lat !== 'number') return [];
    return [
      {
        id: ev.id ?? `${ev.title ?? 'event'}-${lng}-${lat}`,
        title: ev.title ?? 'Untitled event',
        category: resolveCategory(ev.categories ?? []),
        lng,
        lat,
        date: geo.date ?? new Date().toISOString(),
      },
    ];
  });
}

export default function GlobeView(_props: GlobeChamberProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<any>(null);
  const [events, setEvents] = useState<EONETEvent[]>([]);
  const [activeCats, setActiveCats] = useState<Set<EONETCategory>>(new Set(Object.keys(CAT_COLOR) as EONETCategory[]));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const evts = await fetchEONET();
      setEvents(evts);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    let frameId = 0;
    let handleResize: (() => void) | null = null;

    import('globe.gl').then(({ default: Globe }) => {
      if (cancelled || !containerRef.current) return;

      const el = containerRef.current;
      const globe = new Globe(el);
      globeRef.current = globe;

      globe
        .width(el.clientWidth)
        .height(el.clientHeight)
        .backgroundColor('#000000')
        .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-dark.jpg')
        .atmosphereColor('#1e40af')
        .atmosphereAltitude(0.12)
        .enablePointerInteraction(true);

      const rotate = () => {
        const ctrl = globe.controls();
        if (ctrl) {
          ctrl.autoRotate = true;
          ctrl.autoRotateSpeed = 0.4;
        }
        frameId = requestAnimationFrame(rotate);
      };
      frameId = requestAnimationFrame(rotate);

      handleResize = () => {
        globe.width(el.clientWidth).height(el.clientHeight);
      };
      window.addEventListener('resize', handleResize);
    }).catch((err) => {
      setError(err instanceof Error ? err.message : 'Globe failed to load');
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
      if (handleResize) window.removeEventListener('resize', handleResize);
      if (containerRef.current) containerRef.current.innerHTML = '';
    };
  }, []);

  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;

    const visible = events.filter((e) => activeCats.has(e.category));

    globe
      .pointsData(visible)
      .pointLat((d: EONETEvent) => d.lat)
      .pointLng((d: EONETEvent) => d.lng)
      .pointColor((d: EONETEvent) => CAT_COLOR[d.category])
      .pointAltitude(0.015)
      .pointRadius(0.35)
      .pointLabel(
        (d: EONETEvent) =>
          `<div style="background:#000;border:1px solid #166534;padding:6px 10px;font-family:monospace;font-size:11px;color:#4ade80;max-width:220px">
            <div style="color:#86efac;font-weight:600">${d.title}</div>
            <div style="color:#166534;margin-top:3px">${CAT_LABEL[d.category]} · ${new Date(d.date).toLocaleDateString()}</div>
            <div style="color:#14532d;margin-top:2px;font-size:10px">${d.lat.toFixed(2)}°, ${d.lng.toFixed(2)}°</div>
          </div>`,
      );
  }, [events, activeCats]);

  const counts = events.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + 1;
    return acc;
  }, {});

  const toggleCat = (cat: EONETCategory) => {
    setActiveCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const visible = events.filter((e) => activeCats.has(e.category));

  return (
    <div className="flex h-[min(72vh,640px)] w-full flex-col border-y border-slate-800 bg-black font-mono text-green-400 sm:rounded-lg sm:border">
      <div className="flex shrink-0 items-center gap-4 border-b border-green-900 px-4 py-2 text-xs">
        <span className="uppercase tracking-widest text-green-500">◎ Globe</span>
        <span className="text-green-700">NASA EONET · Open Events · Last 30 days · 3D</span>
        <span className="ml-auto text-green-700">{loading ? 'Loading…' : error ? `⚠ ${error}` : `${visible.length} events`}</span>
        <button onClick={load} className="text-green-600 transition-colors hover:text-green-400" aria-label="Refresh">↻</button>
      </div>

      <div ref={containerRef} className="relative flex-1 overflow-hidden" />

      <div className="flex shrink-0 flex-wrap gap-2 border-t border-green-900 px-4 py-2 text-[10px]">
        {(Object.keys(CAT_COLOR) as EONETCategory[]).map((cat) => {
          const active = activeCats.has(cat);
          return (
            <button
              key={cat}
              onClick={() => toggleCat(cat)}
              className="flex items-center gap-1.5 border px-2 py-0.5 transition-opacity"
              style={{ borderColor: CAT_COLOR[cat], opacity: active ? 1 : 0.3, color: CAT_COLOR[cat] }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  display: 'inline-block',
                  background: active ? CAT_COLOR[cat] : 'transparent',
                  border: `1px solid ${CAT_COLOR[cat]}`,
                }}
              />
              {CAT_LABEL[cat]}
              {counts[cat] ? ` (${counts[cat]})` : ''}
            </button>
          );
        })}
      </div>
    </div>
  );
}
