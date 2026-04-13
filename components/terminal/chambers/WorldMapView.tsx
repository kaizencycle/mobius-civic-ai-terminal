'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { merge, mesh } from 'topojson-client';
import type { GeometryCollection, MultiPolygon, Polygon } from 'topojson-specification';
import type { Topology } from 'topojson-specification';
import { geoEquirectangular, geoPath } from 'd3-geo';
import { buildGlobePinsFromMicro } from '@/lib/terminal/globePins';
import type { GlobePin } from '@/lib/terminal/globePins';
import { WORLD_STATE_THEME, type WorldStateSignalTone } from '@/lib/terminal/worldStateTheme';
import type { GlobeChamberProps } from './types';

import countriesTopology from 'world-atlas/countries-110m.json';

const MAP_WIDTH = 1000;
const MAP_HEIGHT = 500;
const MIN_ZOOM = 1;
const MAX_ZOOM = 8;
const ZOOM_STEP = 1.25;

function pinTone(label: string): WorldStateSignalTone {
  const signalLabel = label.toLowerCase();
  if (signalLabel.includes('storm') || signalLabel.includes('flood') || signalLabel.includes('water')) return 'water';
  if (signalLabel.includes('critical')) return 'critical';
  if (signalLabel.includes('elevated')) return 'elevated';
  return 'nominal';
}

function pinDisplayColor(pin: GlobePin): string {
  if (pin.palette === 'seismic') return '#a855f7';
  const tone = pinTone(`${pin.title} ${pin.severity}`);
  return WORLD_STATE_THEME.signal[tone];
}

type CountriesObjects = { countries: GeometryCollection };

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

    const land = merge(topo, countriesObj.geometries as Array<Polygon | MultiPolygon>);
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

function clientToSvg(svg: SVGSVGElement, clientX: number, clientY: number): { x: number; y: number } {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const p = pt.matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}

export default function WorldMapView({ micro = null, echoEpicon = [], cycleId = '—', giScore = 0 }: Partial<GlobeChamberProps> = {}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [selectedPin, setSelectedPin] = useState<GlobePin | null>(null);
  const dragRef = useRef<{ active: boolean; lastX: number; lastY: number } | null>(null);
  const pinchRef = useRef<{ dist: number; cx: number; cy: number } | null>(null);
  const scaleRef = useRef(1);

  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  const pins = useMemo(() => {
    try {
      return buildGlobePinsFromMicro(micro, echoEpicon);
    } catch (err) {
      console.warn('[WorldMapView] pin build failed:', err);
      return [];
    }
  }, [micro, echoEpicon]);

  const { landPath, borderPath, project } = useMemo(() => buildMapLayers(), []);

  const mapTransform = `translate(${tx},${ty}) scale(${scale})`;

  const zoomAt = useCallback((svg: SVGSVGElement, clientX: number, clientY: number, nextScale: number) => {
    const { x: fx, y: fy } = clientToSvg(svg, clientX, clientY);
    const s = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextScale));
    setScale((prevS) => {
      if (Math.abs(s - prevS) < 1e-6) return prevS;
      setTx((prevTx) => prevTx + fx * (prevS - s));
      setTy((prevTy) => prevTy + fy * (prevS - s));
      return s;
    });
  }, []);

  const zoomCenter = useCallback(
    (factor: number) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      zoomAt(svg, rect.left + rect.width / 2, rect.top + rect.height / 2, scaleRef.current * factor);
    },
    [zoomAt],
  );

  const resetView = useCallback(() => {
    setScale(1);
    setTx(0);
    setTy(0);
    setSelectedPin(null);
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const onWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 1 / ZOOM_STEP : ZOOM_STEP;
      zoomAt(svg, e.clientX, e.clientY, scaleRef.current * delta);
    };

    const onTouchStartNative = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const a = e.touches[0];
        const b = e.touches[1];
        if (!a || !b) return;
        const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        pinchRef.current = {
          dist,
          cx: (a.clientX + b.clientX) / 2,
          cy: (a.clientY + b.clientY) / 2,
        };
      }
    };

    const onTouchMoveNative = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !pinchRef.current) return;
      e.preventDefault();
      const a = e.touches[0];
      const b = e.touches[1];
      if (!a || !b) return;
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const { dist: d0, cx, cy } = pinchRef.current;
      if (d0 < 1) return;
      const factor = dist / d0;
      pinchRef.current = { dist, cx, cy };
      zoomAt(svg, cx, cy, scaleRef.current * factor);
    };

    const onTouchEndNative = () => {
      pinchRef.current = null;
    };

    svg.addEventListener('wheel', onWheelNative, { passive: false });
    svg.addEventListener('touchstart', onTouchStartNative, { passive: true });
    svg.addEventListener('touchmove', onTouchMoveNative, { passive: false });
    svg.addEventListener('touchend', onTouchEndNative);
    svg.addEventListener('touchcancel', onTouchEndNative);

    return () => {
      svg.removeEventListener('wheel', onWheelNative);
      svg.removeEventListener('touchstart', onTouchStartNative);
      svg.removeEventListener('touchmove', onTouchMoveNative);
      svg.removeEventListener('touchend', onTouchEndNative);
      svg.removeEventListener('touchcancel', onTouchEndNative);
    };
  }, [zoomAt]);

  const onPointerDownMap = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType !== 'touch') return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = { active: true, lastX: e.clientX, lastY: e.clientY };
    setSelectedPin(null);
  }, []);

  const onPointerMoveMap = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d?.active) return;
    const dx = e.clientX - d.lastX;
    const dy = e.clientY - d.lastY;
    d.lastX = e.clientX;
    d.lastY = e.clientY;
    const svg = svgRef.current;
    if (!svg) return;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    setTx((t) => t + dx / ctm.a);
    setTy((t) => t + dy / ctm.d);
  }, []);

  const endDrag = useCallback(() => {
    if (dragRef.current) dragRef.current.active = false;
  }, []);

  const selectPin = useCallback((pin: GlobePin) => {
    dragRef.current = null;
    setSelectedPin(pin);
  }, []);

  const metaEpicon = selectedPin?.meta?.epiconId;

  return (
    <div className="relative h-[min(72vh,640px)] w-full overflow-hidden border-y border-slate-800 bg-[#020408] touch-none sm:rounded-lg sm:border">
      <div className="pointer-events-none absolute left-3 top-10 z-20 max-w-[min(92%,280px)] rounded border border-white/[0.08] bg-[#020408]/92 px-2 py-1.5 text-[9px] font-mono text-slate-300 shadow-lg backdrop-blur-sm">
        <div className="mb-1 text-[8px] uppercase tracking-[0.14em] text-slate-500">Legend</div>
        <ul className="space-y-1">
          <li className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: WORLD_STATE_THEME.signal.nominal }} />
            <span>Nominal / environ</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: WORLD_STATE_THEME.signal.elevated }} />
            <span>Elevated / watch</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: WORLD_STATE_THEME.signal.critical }} />
            <span>Critical</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: WORLD_STATE_THEME.signal.water }} />
            <span>Water / hazard</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full bg-violet-500" />
            <span>Seismic · EPICON</span>
          </li>
        </ul>
      </div>

      <div className="pointer-events-auto absolute right-2 top-10 z-20 flex flex-col gap-1">
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => zoomCenter(ZOOM_STEP)}
          className="rounded border border-slate-600 bg-slate-900/90 px-2 py-1 font-mono text-xs text-slate-200 active:bg-slate-800"
        >
          +
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => zoomCenter(1 / ZOOM_STEP)}
          className="rounded border border-slate-600 bg-slate-900/90 px-2 py-1 font-mono text-xs text-slate-200 active:bg-slate-800"
        >
          −
        </button>
        <button
          type="button"
          aria-label="Reset map view"
          onClick={resetView}
          className="rounded border border-slate-600 bg-slate-900/90 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide text-slate-400 active:bg-slate-800"
        >
          fit
        </button>
      </div>

      <div className="absolute left-3 top-3 z-10 rounded border border-white/[0.06] bg-[#020408]/85 px-2 py-1.5 text-[9px] font-mono uppercase tracking-[0.14em] text-emerald-300">
        Mobile World Map · {cycleId} · GI {giScore.toFixed(2)}
        <span className="ml-2 text-slate-500 normal-case">· wheel / pinch zoom · drag pan</span>
      </div>

      {selectedPin ? (
        <div className="absolute bottom-14 left-2 right-2 z-30 max-h-[42%] overflow-y-auto rounded border border-cyan-500/30 bg-[#020617]/95 p-3 text-left shadow-xl backdrop-blur-sm sm:left-auto sm:right-2 sm:max-w-sm">
          <div className="mb-2 flex items-start justify-between gap-2">
            <div className="font-mono text-[10px] uppercase tracking-wide text-cyan-400">Inspect</div>
            <button
              type="button"
              onClick={() => setSelectedPin(null)}
              className="shrink-0 rounded border border-slate-600 px-2 py-0.5 font-mono text-[10px] text-slate-400"
            >
              Close
            </button>
          </div>
          <div className="font-mono text-xs text-slate-100">{selectedPin.title}</div>
          <div className="mt-1 space-y-1 font-mono text-[10px] text-slate-400">
            <div>
              <span className="text-slate-500">Source</span> · {selectedPin.source}
            </div>
            <div>
              <span className="text-slate-500">Agent</span> · {selectedPin.agent} ·{' '}
              <span className="text-slate-500">Severity</span> · {selectedPin.severity}
            </div>
            <div>
              <span className="text-slate-500">Lat/Lng</span> · {selectedPin.lat.toFixed(2)}, {selectedPin.lng.toFixed(2)}
            </div>
            {selectedPin.clusterLabel ? (
              <div>
                <span className="text-slate-500">Layer</span> · {selectedPin.clusterLabel}
              </div>
            ) : null}
            {typeof metaEpicon === 'string' || typeof metaEpicon === 'number' ? (
              <div>
                <span className="text-slate-500">EPICON</span> · {String(metaEpicon)}
              </div>
            ) : null}
            <div className="text-slate-500">{selectedPin.provenance}</div>
            <p className="text-[10px] leading-snug text-slate-300">{selectedPin.narrativeWhy}</p>
          </div>
        </div>
      ) : null}

      <svg
        ref={svgRef}
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        className="h-full w-full cursor-grab active:cursor-grabbing"
        role="application"
        aria-label="Mobius mobile world state map — drag to pan, scroll or buttons to zoom, tap dots to inspect"
      >
        <defs>
          <linearGradient id="wm-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={WORLD_STATE_THEME.background.deepNavy} />
            <stop offset="100%" stopColor={WORLD_STATE_THEME.background.nearBlack} />
          </linearGradient>
        </defs>

        <rect x="0" y="0" width={MAP_WIDTH} height={MAP_HEIGHT} fill="url(#wm-bg)" />

        <g transform={mapTransform}>
          <rect
            x={0}
            y={0}
            width={MAP_WIDTH}
            height={MAP_HEIGHT}
            fill="transparent"
            onPointerDown={onPointerDownMap}
            onPointerMove={onPointerMoveMap}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            style={{ touchAction: 'none' }}
          />

          {Array.from({ length: 9 }).map((_, idx) => (
            <line
              key={`lat-${idx}`}
              x1="0"
              x2={MAP_WIDTH}
              y1={(idx / 8) * MAP_HEIGHT}
              y2={(idx / 8) * MAP_HEIGHT}
              stroke={WORLD_STATE_THEME.land.grid}
              strokeOpacity="0.35"
              pointerEvents="none"
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
              pointerEvents="none"
            />
          ))}

          {landPath ? (
            <path d={landPath} fill={WORLD_STATE_THEME.land.fill} fillOpacity={0.92} stroke="none" pointerEvents="none" />
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
            const scalePin = pin.palette === 'seismic' && mag !== null ? 0.85 + Math.min(0.9, Math.max(0, mag - 4.5) * 0.4) : 1;
            const rOuter = 7 * scalePin;
            const rInner = 4 * scalePin;
            const color = pinDisplayColor(pin);
            const isSel = selectedPin?.id === pin.id;
            const hitR = Math.max(18, rOuter + 8);

            return (
              <g key={pin.id} style={{ cursor: 'pointer' }}>
                <circle
                  cx={x}
                  cy={y}
                  r={hitR}
                  fill="transparent"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    selectPin(pin);
                  }}
                />
                <circle cx={x} cy={y} r={rOuter} fill={color} fillOpacity="0.14" pointerEvents="none" />
                <circle
                  cx={x}
                  cy={y}
                  r={rInner}
                  fill={color}
                  fillOpacity="0.95"
                  stroke={isSel ? '#f0f9ff' : 'none'}
                  strokeWidth={isSel ? 1.5 : 0}
                  pointerEvents="none"
                />
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
