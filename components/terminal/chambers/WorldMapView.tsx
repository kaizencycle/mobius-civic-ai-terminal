'use client';

import { useMemo } from 'react';
import { merge, mesh } from 'topojson-client';
import type { GeometryCollection, MultiPolygon, Polygon } from 'topojson-specification';
import type { Topology } from 'topojson-specification';
import { geoEquirectangular, geoPath } from 'd3-geo';
import { buildGlobePinsFromMicro } from '@/lib/terminal/globePins';
import { WORLD_STATE_THEME, type WorldStateSignalTone } from '@/lib/terminal/worldStateTheme';
import type { GlobeChamberProps } from './types';

import countriesTopology from 'world-atlas/countries-110m.json';

const MAP_WIDTH = 1000;
const MAP_HEIGHT = 500;

function pinTone(label: string): WorldStateSignalTone {
  const signalLabel = label.toLowerCase();
  if (signalLabel.includes('storm') || signalLabel.includes('flood') || signalLabel.includes('water')) return 'water';
  if (signalLabel.includes('critical')) return 'critical';
  if (signalLabel.includes('elevated')) return 'elevated';
  return 'nominal';
}

type CountriesObjects = { countries: GeometryCollection };

/** Matches prior pin math if d3 fitSize fails (mobile WebKit edge cases). */
function projectLngLatEquirectangular(lng: number, lat: number): [number, number] {
  const x = ((lng + 180) / 360) * MAP_WIDTH;
  const y = ((90 - lat) / 180) * MAP_HEIGHT;
  return [x, y];
}

function buildMapLayers(): {
  landPath: string;
  borderPath: string;
  project: (lng: number, lat: number) => [number, number];
} {
  const fallback = { landPath: '', borderPath: '', project: projectLngLatEquirectangular };
  try {
    const topo = countriesTopology as unknown as Topology<CountriesObjects>;
    const countriesObj = topo.objects.countries;
    if (!countriesObj?.geometries?.length) return fallback;

    // merge() expects an array of polygon geometries, not the whole GeometryCollection
    // (passing the collection throws: objects.forEach is not a function → empty fallback).
    const land = merge(
      topo,
      countriesObj.geometries as Array<Polygon | MultiPolygon>,
    );
    const borders = mesh(topo, countriesObj, (a, b) => a !== b);

    const projection = geoEquirectangular().fitSize([MAP_WIDTH, MAP_HEIGHT], land);
    const pathGen = geoPath(projection);

    const project = (lng: number, lat: number): [number, number] => {
      const p = projection([lng, lat]);
      if (p && Number.isFinite(p[0]) && Number.isFinite(p[1])) return [p[0], p[1]];
      return projectLngLatEquirectangular(lng, lat);
    };

    return {
      landPath: pathGen(land) ?? '',
      borderPath: pathGen(borders) ?? '',
      project,
    };
  } catch (err) {
    console.warn('[WorldMapView] Natural Earth layer build failed, using grid + pins only:', err);
    return fallback;
  }
}

export default function WorldMapView({ micro = null, echoEpicon = [], cycleId = '—', giScore = 0 }: Partial<GlobeChamberProps> = {}) {
  const pins = useMemo(() => {
    try {
      return buildGlobePinsFromMicro(micro, echoEpicon);
    } catch (err) {
      console.warn('[WorldMapView] pin build failed:', err);
      return [];
    }
  }, [micro, echoEpicon]);

  const { landPath, borderPath, project } = useMemo(() => buildMapLayers(), []);

  return (
    <div className="relative h-[min(72vh,640px)] w-full overflow-hidden border-y border-slate-800 bg-[#020408] sm:rounded-lg sm:border">
      <div className="absolute left-3 top-3 z-10 rounded border border-white/[0.06] bg-[#020408]/85 px-2 py-1.5 text-[9px] font-mono uppercase tracking-[0.14em] text-emerald-300">
        Mobile World Map · {cycleId} · GI {giScore.toFixed(2)}
      </div>
      <svg
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        className="h-full w-full"
        role="img"
        aria-label="Mobius mobile world state map with country boundaries"
      >
        <defs>
          <linearGradient id="wm-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={WORLD_STATE_THEME.background.deepNavy} />
            <stop offset="100%" stopColor={WORLD_STATE_THEME.background.nearBlack} />
          </linearGradient>
        </defs>

        <rect x="0" y="0" width={MAP_WIDTH} height={MAP_HEIGHT} fill="url(#wm-bg)" />

        {Array.from({ length: 9 }).map((_, idx) => (
          <line
            key={`lat-${idx}`}
            x1="0"
            x2={MAP_WIDTH}
            y1={(idx / 8) * MAP_HEIGHT}
            y2={(idx / 8) * MAP_HEIGHT}
            stroke={WORLD_STATE_THEME.land.grid}
            strokeOpacity="0.35"
          />
        ))}
        {Array.from({ length: 13 }).map((_, idx) => (
          <line
            key={`lng-${idx}`}
            y1="0"
            y2={MAP_HEIGHT}
            x1={(idx / 12) * MAP_WIDTH}
            x2={(idx / 12) * MAP_WIDTH}
            stroke={WORLD_STATE_THEME.land.grid}
            strokeOpacity="0.25"
          />
        ))}

        {landPath ? (
          <path
            d={landPath}
            fill={WORLD_STATE_THEME.land.fill}
            fillOpacity={0.92}
            stroke="none"
          />
        ) : null}

        {borderPath ? (
          <path
            d={borderPath}
            fill="none"
            stroke={WORLD_STATE_THEME.land.highlight}
            strokeWidth={0.5}
            strokeOpacity={0.65}
            pointerEvents="none"
          />
        ) : null}

        {pins.map((pin) => {
          const [x, y] = project(pin.lng, pin.lat);
          if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
          const magRaw = pin.meta.magnitude ?? pin.meta.mag;
          const mag = typeof magRaw === 'number' && Number.isFinite(magRaw) ? magRaw : null;
          const scale = pin.palette === 'seismic' && mag !== null ? 0.85 + Math.min(0.9, Math.max(0, mag - 4.5) * 0.4) : 1;
          const rOuter = 7 * scale;
          const rInner = 4 * scale;
          const tone = pinTone(`${pin.title} ${pin.severity}`);
          const color = pin.palette === 'seismic' ? '#a855f7' : WORLD_STATE_THEME.signal[tone];
          return (
            <g key={pin.id}>
              <circle cx={x} cy={y} r={rOuter} fill={color} fillOpacity="0.14" />
              <circle cx={x} cy={y} r={rInner} fill={color} fillOpacity="0.95" />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
