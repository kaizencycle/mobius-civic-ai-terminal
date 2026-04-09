"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  ZoomableGroup,
} from "react-simple-maps";

type EONETCategory =
  | "wildfires"
  | "severeStorms"
  | "volcanoes"
  | "floods"
  | "earthquakes"
  | "drought"
  | "other";

interface EONETEvent {
  id: string;
  title: string;
  category: EONETCategory;
  coordinates: [number, number];
  date: string;
  link?: string;
}

interface EONETApiEvent {
  id: string;
  title: string;
  categories: { id: string; title: string }[];
  geometry: { date: string; coordinates: [number, number] }[];
  sources?: { url: string }[];
}

const CATEGORY_COLORS: Record<EONETCategory, string> = {
  wildfires: "#f97316",
  severeStorms: "#60a5fa",
  volcanoes: "#f43f5e",
  floods: "#38bdf8",
  earthquakes: "#a78bfa",
  drought: "#fbbf24",
  other: "#94a3b8",
};

const CATEGORY_LABELS: Record<EONETCategory, string> = {
  wildfires: "Wildfire",
  severeStorms: "Storm",
  volcanoes: "Volcano",
  floods: "Flood",
  earthquakes: "Quake",
  drought: "Drought",
  other: "Event",
};

function resolveCategory(cats: { id: string }[]): EONETCategory {
  const ids = cats.map((c) => c.id.toLowerCase());
  if (ids.some((i) => i.includes("wildfire"))) return "wildfires";
  if (ids.some((i) => i.includes("storm") || i.includes("cyclone"))) return "severeStorms";
  if (ids.some((i) => i.includes("volcan"))) return "volcanoes";
  if (ids.some((i) => i.includes("flood"))) return "floods";
  if (ids.some((i) => i.includes("quake") || i.includes("seismic"))) return "earthquakes";
  if (ids.some((i) => i.includes("drought"))) return "drought";
  return "other";
}

const EONET_URL = "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=80&days=30";

async function fetchEONET(): Promise<EONETEvent[]> {
  const res = await fetch(EONET_URL, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`EONET ${res.status}`);
  const data = await res.json();

  return (data.events as EONETApiEvent[]).flatMap((ev) => {
    const geo = ev.geometry?.[0];
    if (!geo?.coordinates) return [];
    const [lng, lat] = geo.coordinates;
    if (typeof lng !== "number" || typeof lat !== "number") return [];
    return [
      {
        id: ev.id,
        title: ev.title,
        category: resolveCategory(ev.categories),
        coordinates: [lng, lat],
        date: geo.date,
        link: ev.sources?.[0]?.url,
      },
    ];
  });
}

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

export default function GlobeChamber() {
  const [events, setEvents] = useState<EONETEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<EONETEvent | null>(null);
  const [activeCategories, setActiveCategories] = useState<Set<EONETCategory>>(
    new Set(Object.keys(CATEGORY_COLORS) as EONETCategory[]),
  );

  const load = useCallback(async () => {
    try {
      setError(null);
      const evts = await fetchEONET();
      setEvents(evts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "EONET fetch failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts = events.reduce<Record<string, number>>((acc, ev) => {
    acc[ev.category] = (acc[ev.category] ?? 0) + 1;
    return acc;
  }, {});

  const toggleCat = (cat: EONETCategory) => {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

  const visible = events.filter((e) => activeCategories.has(e.category));

  return (
    <div className="flex h-full select-none flex-col bg-black font-mono text-green-400">
      <div className="flex items-center gap-4 border-b border-green-900 px-4 py-2 text-xs">
        <span className="uppercase tracking-widest text-green-500">◎ Globe</span>
        <span className="text-green-700">NASA EONET · Open Events · Last 30 days</span>
        <span className="ml-auto text-green-700">
          {loading ? "Loading…" : error ? `⚠ ${error}` : `${visible.length} events`}
        </span>
        <button
          onClick={load}
          className="text-green-600 transition-colors hover:text-green-400"
          aria-label="Refresh EONET data"
        >
          ↻
        </button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <ComposableMap
          projection="geoEqualEarth"
          style={{ width: "100%", height: "100%", background: "transparent" }}
        >
          <ZoomableGroup zoom={1} minZoom={0.8} maxZoom={6}>
            <Geographies geography={GEO_URL}>
              {({ geographies }: { geographies: any[] }) =>
                geographies.map((geo: any) => (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill="#0d1a0d"
                    stroke="#1a3a1a"
                    strokeWidth={0.3}
                    style={{
                      default: { outline: "none" },
                      hover: { fill: "#112211", outline: "none" },
                      pressed: { outline: "none" },
                    }}
                  />
                ))
              }
            </Geographies>

            {visible.map((ev) => (
              <Marker
                key={ev.id}
                coordinates={ev.coordinates}
                onMouseEnter={() => setTooltip(ev)}
                onMouseLeave={() => setTooltip(null)}
              >
                <circle
                  r={4}
                  fill={CATEGORY_COLORS[ev.category]}
                  fillOpacity={0.85}
                  stroke="#000"
                  strokeWidth={0.5}
                  className="cursor-pointer"
                  style={{ transition: "r 0.15s" }}
                  onMouseEnter={(e) => {
                    (e.target as SVGCircleElement).setAttribute("r", "7");
                  }}
                  onMouseLeave={(e) => {
                    (e.target as SVGCircleElement).setAttribute("r", "4");
                  }}
                />
              </Marker>
            ))}
          </ZoomableGroup>
        </ComposableMap>

        {tooltip && (
          <div className="pointer-events-none absolute bottom-4 left-4 z-10 max-w-xs border border-green-800 bg-black/90 px-3 py-2 text-xs">
            <div className="truncate font-medium text-green-300">{tooltip.title}</div>
            <div className="mt-0.5 text-green-600">
              {CATEGORY_LABELS[tooltip.category]} · {new Date(tooltip.date).toLocaleDateString()}
            </div>
            <div className="mt-0.5 text-[10px] text-green-700">
              {tooltip.coordinates[1].toFixed(2)}°N {tooltip.coordinates[0].toFixed(2)}°E
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-t border-green-900 px-4 py-2 text-[10px]">
        {(Object.keys(CATEGORY_COLORS) as EONETCategory[]).map((cat) => {
          const active = activeCategories.has(cat);
          return (
            <button
              key={cat}
              onClick={() => toggleCat(cat)}
              className="flex items-center gap-1.5 border px-2 py-0.5 transition-opacity"
              style={{
                borderColor: CATEGORY_COLORS[cat],
                opacity: active ? 1 : 0.3,
                color: CATEGORY_COLORS[cat],
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: active ? CATEGORY_COLORS[cat] : "transparent",
                  display: "inline-block",
                  border: `1px solid ${CATEGORY_COLORS[cat]}`,
                }}
              />
              {CATEGORY_LABELS[cat]}
              {counts[cat] ? ` (${counts[cat]})` : ""}
            </button>
          );
        })}
      </div>
    </div>
  );
}
