const EONET_BASE = 'https://eonet.gsfc.nasa.gov/api/v3';

export interface EonetEvent {
  id: string;
  title: string;
  categories: { id: string; title: string }[];
  geometry: { date: string; type: string; coordinates: number[] | number[][][] }[];
  closed: string | null;
}

type EonetEventsResponse = {
  events?: EonetEvent[];
};

export async function fetchEonetEvents(days = 7): Promise<EonetEvent[]> {
  const url = `${EONET_BASE}/events?status=open&days=${days}&limit=50`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5000), cache: 'no-store' });
  if (!res.ok) throw new Error(`EONET ${res.status}`);
  const data = (await res.json()) as EonetEventsResponse;
  return data.events ?? [];
}

// Normalize open event count to 0-1 signal value
// More open events = lower value (higher stress)
export function scoreEonetEvents(events: EonetEvent[]): number {
  const count = events.length;
  if (count === 0) return 1.0; // no events = nominal
  if (count <= 5) return 0.9; // quiet
  if (count <= 15) return 0.75; // moderate activity
  if (count <= 30) return 0.55; // elevated
  if (count <= 50) return 0.35; // high
  return 0.2; // extreme
}

// Score by specific high-impact categories
export function scoreEonetByCategory(events: EonetEvent[]): Record<string, number> {
  const cats = ['severeStorms', 'wildfires', 'volcanoes', 'floods', 'drought'];
  const result: Record<string, number> = {};
  for (const cat of cats) {
    const count = events.filter((event) => event.categories.some((category) => category.id === cat)).length;
    result[cat] = count === 0 ? 1.0
      : count <= 3 ? 0.8
        : count <= 8 ? 0.6
          : count <= 15 ? 0.4
            : 0.2;
  }
  return result;
}
