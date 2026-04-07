import type { GlobePin } from '@/lib/terminal/globePins';

function countElevated(pins: GlobePin[]) {
  return pins.filter((p) => p.severity === 'elevated' || p.severity === 'critical').length;
}

function countByDomain(pins: GlobePin[], key: GlobePin['domainKey']) {
  return pins.filter((p) => p.domainKey === key).length;
}

export function computeGlobeDeltaLines(prev: GlobePin[], next: GlobePin[], giScore: number): string[] {
  const lines: string[] = [];
  const prevEl = countElevated(prev);
  const nextEl = countElevated(next);
  const d = nextEl - prevEl;
  if (d > 0) lines.push(`+${d} elevated signal${d === 1 ? '' : 's'}`);
  else if (d < 0) lines.push(`${d} elevated signal${d === -1 ? '' : 's'} (cleared)`);

  const prevPins = new Set(prev.map((p) => p.id));
  const newcomers = next.filter((p) => !prevPins.has(p.id));
  const seismicNew = newcomers.filter((p) => p.source.includes('USGS')).length;
  if (seismicNew > 0) lines.push(`+${seismicNew} new seismic pin${seismicNew === 1 ? '' : 's'}`);

  const fin = countByDomain(next, 'financial');
  if (fin > 0) lines.push(`Financial lane: ${fin} live pin${fin === 1 ? '' : 's'}`);

  if (giScore >= 0.85) lines.push('GI band: nominal');
  else if (giScore >= 0.7) lines.push('GI band: watch');
  else lines.push('GI band: stressed');

  if (lines.length === 0) lines.push('World state steady — no pin churn');
  return lines.slice(0, 4);
}
