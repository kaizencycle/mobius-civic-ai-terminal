"use client";

import { useEffect, useState, useCallback, useRef } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

type EONETCategory =
  | "wildfires" | "severeStorms" | "volcanoes"
  | "floods" | "earthquakes" | "drought" | "other";

interface EONETEvent {
  id: string;
  title: string;
  category: EONETCategory;
  lng: number;
  lat: number;
  date: string;
}

// ─── ATLAS color grammar ─────────────────────────────────────────────────────

const CAT_COLOR: Record<EONETCategory, string> = {
  wildfires:    "#f97316",
  severeStorms: "#60a5fa",
  volcanoes:    "#f43f5e",
  floods:       "#38bdf8",
  earthquakes:  "#a78bfa",
  drought:      "#fbbf24",
  other:        "#94a3b8",
};

const CAT_LABEL: Record<EONETCategory, string> = {
  wildfires:    "Wildfire",
  severeStorms: "Storm",
  volcanoes:    "Volcano",
  floods:       "Flood",
  earthquakes:  "Quake",
  drought:      "Drought",
  other:        "Event",
};

function resolveCategory(cats: { id: string }[]): EONETCategory {
  const ids = cats.map((c) => c.id.toLowerCase());
  if (ids.some((i) => i.includes("wildfire")))                       return "wildfires";
  if (ids.some((i) => i.includes("storm") || i.includes("cyclone"))) return "severeStorms";
  if (ids.some((i) => i.includes("volcan")))                         return "volcanoes";
  if (ids.some((i) => i.includes("flood")))                          return "floods";
  if (ids.some((i) => i.includes("quake") || i.includes("seismic"))) return "earthquakes";
  if (ids.some((i) => i.includes("drought")))                        return "drought";
  return "other";
}

// ─── Projection (equirectangular) ────────────────────────────────────────────

const W = 960;
const H = 480;

function project(lng: number, lat: number): [number, number] {
  return [((lng + 180) / 360) * W, ((90 - lat) / 180) * H];
}

// ─── Minimal TopoJSON → SVG paths ────────────────────────────────────────────

interface TopoTransform { scale: [number, number]; translate: [number, number] }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Topology = { arcs: [number, number][][]; objects: { countries: { geometries: any[] } }; transform?: TopoTransform };

function arcToCoords(topology: Topology, idx: number): [number, number][] {
  const raw = topology.arcs[idx < 0 ? ~idx : idx];
  const tf  = topology.transform;
  let x = 0, y = 0;
  const pts = raw.map(([dx, dy]: [number, number]) => {
    x += dx; y += dy;
    return tf
      ? ([x * tf.scale[0] + tf.translate[0], y * tf.scale[1] + tf.translate[1]] as [number, number])
      : ([x, y] as [number, number]);
  });
  return idx < 0 ? pts.reverse() : pts;
}

function ringToD(topology: Topology, arcIndices: number[]): string {
  const pts = arcIndices.flatMap((i) => arcToCoords(topology, i));
  if (!pts.length) return "";
  const [head, ...tail] = pts.map(([lng, lat]) => project(lng, lat));
  return `M${head[0].toFixed(1)} ${head[1].toFixed(1)}` +
    tail.map(([px, py]) => `L${px.toFixed(1)} ${py.toFixed(1)}`).join("") + "Z";
}

function topologyToPaths(topology: Topology): string[] {
  const out: string[] = [];
  for (const geo of topology.objects.countries.geometries) {
    if (geo.type === "Polygon") {
      out.push(geo.arcs.map((r: number[]) => ringToD(topology, r)).join(" "));
    } else if (geo.type === "MultiPolygon") {
      for (const poly of geo.arcs as number[][][]) {
        out.push(poly.map((r) => ringToD(topology, r)).join(" "));
      }
    }
  }
  return out.filter(Boolean);
}

// ─── EONET fetch ─────────────────────────────────────────────────────────────

async function fetchEONET(): Promise<EONETEvent[]> {
  const res = await fetch(
    "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=80&days=30"
  );
  if (!res.ok) throw new Error(`EONET ${res.status}`);
  const data = await res.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data.events as any[]).flatMap((ev) => {
    const geo = ev.geometry?.[0];
    if (!geo?.coordinates) return [];
    const [lng, lat] = geo.coordinates as [number, number];
    if (typeof lng !== "number" || typeof lat !== "number") return [];
    return [{ id: ev.id, title: ev.title, category: resolveCategory(ev.categories ?? []), lng, lat, date: geo.date }];
  });
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function GlobeChamber() {
  const [countryPaths, setCountryPaths] = useState<string[]>([]);
  const [events,  setEvents]  = useState<EONETEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<EONETEvent | null>(null);
  const [tipPos,  setTipPos]  = useState({ x: 0, y: 0 });
  const [activeCats, setActiveCats] = useState<Set<EONETCategory>>(
    new Set(Object.keys(CAT_COLOR) as EONETCategory[])
  );
  const svgRef = useRef<SVGSVGElement>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [topoRes, evts] = await Promise.all([
        fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"),
        fetchEONET(),
      ]);
      if (!topoRes.ok) throw new Error("World atlas fetch failed");
      setCountryPaths(topologyToPaths(await topoRes.json()));
      setEvents(evts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const visible = events.filter((e) => activeCats.has(e.category));
  const counts  = events.reduce<Record<string, number>>((a, e) => ({ ...a, [e.category]: (a[e.category] ?? 0) + 1 }), {});
  const toggleCat = (cat: EONETCategory) =>
    setActiveCats((prev) => { const n = new Set(prev); n.has(cat) ? n.delete(cat) : n.add(cat); return n; });

  return (
    <div className="flex flex-col h-full bg-black text-green-400 font-mono select-none">

      {/* Header */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-green-900 text-xs shrink-0">
        <span className="text-green-500 uppercase tracking-widest">◎ Globe</span>
        <span className="text-green-700">NASA EONET · Open Events · Last 30 days</span>
        <span className="ml-auto text-green-700">
          {loading ? "Loading…" : error ? `⚠ ${error}` : `${visible.length} events`}
        </span>
        <button onClick={load} className="text-green-600 hover:text-green-400 transition-colors" aria-label="Refresh">↻</button>
      </div>

      {/* SVG map */}
      <div className="flex-1 relative overflow-hidden">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="xMidYMid meet"
          className="w-full h-full"
        >
          {countryPaths.map((d, i) => (
            <path key={i} d={d} fill="#0d1a0d" stroke="#1a3a1a" strokeWidth={0.4} />
          ))}

          {visible.map((ev) => {
            const [px, py] = project(ev.lng, ev.lat);
            return (
              <circle
                key={ev.id}
                cx={px} cy={py} r={4}
                fill={CAT_COLOR[ev.category]} fillOpacity={0.85}
                stroke="#000" strokeWidth={0.5}
                className="cursor-pointer"
                onMouseMove={(e) => {
                  const rect = svgRef.current?.getBoundingClientRect();
                  if (rect) setTipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
                  setTooltip(ev);
                  e.currentTarget.setAttribute("r", "7");
                }}
                onMouseLeave={(e) => { setTooltip(null); e.currentTarget.setAttribute("r", "4"); }}
              />
            );
          })}
        </svg>

        {tooltip && (
          <div
            className="absolute pointer-events-none z-10 bg-black/90 border border-green-800 px-3 py-2 text-xs max-w-xs"
            style={{ left: tipPos.x + 14, top: tipPos.y - 8 }}
          >
            <div className="text-green-300 font-medium truncate">{tooltip.title}</div>
            <div className="text-green-600 mt-0.5">
              {CAT_LABEL[tooltip.category]} · {new Date(tooltip.date).toLocaleDateString()}
            </div>
            <div className="text-green-700 mt-0.5 text-[10px]">
              {tooltip.lat.toFixed(2)}°N {tooltip.lng.toFixed(2)}°E
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 px-4 py-2 border-t border-green-900 text-[10px] shrink-0">
        {(Object.keys(CAT_COLOR) as EONETCategory[]).map((cat) => {
          const active = activeCats.has(cat);
          return (
            <button
              key={cat}
              onClick={() => toggleCat(cat)}
              className="flex items-center gap-1.5 px-2 py-0.5 border transition-opacity"
              style={{ borderColor: CAT_COLOR[cat], opacity: active ? 1 : 0.3, color: CAT_COLOR[cat] }}
            >
              <span style={{ width: 6, height: 6, borderRadius: "50%", display: "inline-block", background: active ? CAT_COLOR[cat] : "transparent", border: `1px solid ${CAT_COLOR[cat]}` }} />
              {CAT_LABEL[cat]}{counts[cat] ? ` (${counts[cat]})` : ""}
            </button>
          );
        })}
      </div>
    </div>
  );
}
