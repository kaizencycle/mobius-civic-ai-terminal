'use client';

import { useMemo } from 'react';
import { buildGlobePinsFromMicro } from '@/lib/terminal/globePins';
import { WORLD_STATE_THEME, type WorldStateSignalTone } from '@/lib/terminal/worldStateTheme';
import type { GlobeChamberProps } from './types';

const MAP_WIDTH = 1000;
const MAP_HEIGHT = 500;

function pinTone(label: string): WorldStateSignalTone {
  const signalLabel = label.toLowerCase();
  if (signalLabel.includes('storm') || signalLabel.includes('flood') || signalLabel.includes('water')) return 'water';
  if (signalLabel.includes('critical')) return 'critical';
  if (signalLabel.includes('elevated')) return 'elevated';
  return 'nominal';
}

export default function WorldMapView({ micro, echoEpicon, cycleId, giScore }: GlobeChamberProps) {
  const pins = useMemo(() => buildGlobePinsFromMicro(micro, echoEpicon), [micro, echoEpicon]);

  return (
    <div className="relative h-[min(72vh,640px)] w-full border-y border-slate-800 bg-[#020408] sm:rounded-lg sm:border">
      <div className="absolute left-3 top-3 z-10 rounded border border-white/[0.06] bg-[#020408]/85 px-2 py-1.5 text-[9px] font-mono uppercase tracking-[0.14em] text-emerald-300">
        Mobile World Map · {cycleId} · GI {giScore.toFixed(2)}
      </div>
      <svg viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} className="h-full w-full">
        <rect x="0" y="0" width={MAP_WIDTH} height={MAP_HEIGHT} fill={WORLD_STATE_THEME.background.deepNavy} />
        {Array.from({ length: 9 }).map((_, idx) => (
          <line key={`lat-${idx}`} x1="0" x2={MAP_WIDTH} y1={idx * 62.5} y2={idx * 62.5} stroke={WORLD_STATE_THEME.land.grid} strokeOpacity="0.35" />
        ))}
        {Array.from({ length: 13 }).map((_, idx) => (
          <line key={`lng-${idx}`} y1="0" y2={MAP_HEIGHT} x1={idx * 83.3} x2={idx * 83.3} stroke={WORLD_STATE_THEME.land.grid} strokeOpacity="0.25" />
        ))}
        {pins.map((pin) => {
          const x = ((pin.lng + 180) / 360) * MAP_WIDTH;
          const y = ((90 - pin.lat) / 180) * MAP_HEIGHT;
          const tone = pinTone(`${pin.title} ${pin.severity}`);
          return <circle key={pin.id} cx={x} cy={y} r={4} fill={WORLD_STATE_THEME.signal[tone]} fillOpacity="0.95" />;
        })}
      </svg>
    </div>
  );
}
