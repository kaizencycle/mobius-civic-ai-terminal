'use client';

import { useMemo } from 'react';
import { buildGlobePinsFromMicro } from '@/lib/terminal/globePins';
import { WORLD_STATE_THEME, type WorldStateSignalTone } from '@/lib/terminal/worldStateTheme';
import type { GlobeChamberProps } from './types';

const MAP_WIDTH = 1000;
const MAP_HEIGHT = 500;

const LANDMASSES = [
  {
    id: 'north-america',
    d: 'M68 151 L88 131 L120 113 L159 102 L204 100 L245 117 L281 145 L299 170 L291 205 L265 227 L226 247 L186 249 L149 236 L123 217 L95 192 L77 170 Z',
  },
  {
    id: 'greenland',
    d: 'M258 53 L291 40 L337 53 L328 90 L286 96 L255 81 Z',
  },
  {
    id: 'south-america',
    d: 'M249 255 L279 275 L301 317 L307 362 L297 411 L274 456 L251 474 L232 450 L223 410 L223 361 L231 319 Z',
  },
  {
    id: 'eurasia',
    d: 'M421 118 L463 103 L515 98 L566 106 L613 102 L665 115 L724 127 L779 138 L832 155 L877 182 L904 214 L894 243 L858 252 L818 238 L790 224 L753 225 L726 243 L698 250 L673 231 L644 224 L610 238 L581 266 L547 269 L529 242 L501 227 L470 213 L446 189 L430 155 Z',
  },
  {
    id: 'africa',
    d: 'M499 223 L526 241 L547 272 L557 312 L550 359 L531 401 L506 430 L480 427 L456 388 L443 346 L444 301 L459 261 Z',
  },
  {
    id: 'arabia-india',
    d: 'M590 235 L621 247 L646 273 L654 301 L635 319 L606 308 L585 282 L577 255 Z',
  },
  {
    id: 'southeast-asia',
    d: 'M706 268 L732 268 L752 281 L759 303 L744 317 L719 313 L700 298 L694 279 Z',
  },
  {
    id: 'australia',
    d: 'M787 333 L824 324 L864 333 L892 353 L898 382 L879 400 L846 410 L807 406 L783 384 L778 357 Z',
  },
  {
    id: 'japan',
    d: 'M825 201 L834 195 L842 205 L837 219 L828 213 Z',
  },
  {
    id: 'new-zealand',
    d: 'M915 408 L924 403 L931 412 L926 425 L916 421 Z',
  },
  {
    id: 'antarctica',
    d: 'M0 462 L64 454 L147 449 L243 447 L335 448 L432 450 L530 451 L622 449 L718 447 L807 450 L891 455 L960 461 L1000 468 L1000 500 L0 500 Z',
  },
] as const;

function pinTone(label: string): WorldStateSignalTone {
  const signalLabel = label.toLowerCase();
  if (signalLabel.includes('storm') || signalLabel.includes('flood') || signalLabel.includes('water')) return 'water';
  if (signalLabel.includes('critical')) return 'critical';
  if (signalLabel.includes('elevated')) return 'elevated';
  return 'nominal';
}

export default function WorldMapView({ micro = null, echoEpicon = [], cycleId = '—', giScore = 0 }: Partial<GlobeChamberProps> = {}) {
  const pins = useMemo(() => buildGlobePinsFromMicro(micro, echoEpicon), [micro, echoEpicon]);

  return (
    <div className="relative h-[min(72vh,640px)] w-full overflow-hidden border-y border-slate-800 bg-[#020408] sm:rounded-lg sm:border">
      <div className="absolute left-3 top-3 z-10 rounded border border-white/[0.06] bg-[#020408]/85 px-2 py-1.5 text-[9px] font-mono uppercase tracking-[0.14em] text-emerald-300">
        Mobile World Map · {cycleId} · GI {giScore.toFixed(2)}
      </div>
      <svg viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} className="h-full w-full" role="img" aria-label="Mobius mobile world state map">
        <defs>
          <linearGradient id="wm-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={WORLD_STATE_THEME.background.deepNavy} />
            <stop offset="100%" stopColor={WORLD_STATE_THEME.background.nearBlack} />
          </linearGradient>
        </defs>

        <rect x="0" y="0" width={MAP_WIDTH} height={MAP_HEIGHT} fill="url(#wm-bg)" />

        {LANDMASSES.map((shape) => (
          <path
            key={shape.id}
            d={shape.d}
            fill={WORLD_STATE_THEME.land.fill}
            stroke={WORLD_STATE_THEME.land.highlight}
            strokeWidth="1.2"
            strokeOpacity="0.75"
            fillOpacity="0.95"
          />
        ))}

        {Array.from({ length: 9 }).map((_, idx) => (
          <line
            key={`lat-${idx}`}
            x1="0"
            x2={MAP_WIDTH}
            y1={idx * 62.5}
            y2={idx * 62.5}
            stroke={WORLD_STATE_THEME.land.grid}
            strokeOpacity="0.35"
          />
        ))}
        {Array.from({ length: 13 }).map((_, idx) => (
          <line
            key={`lng-${idx}`}
            y1="0"
            y2={MAP_HEIGHT}
            x1={idx * 83.3}
            x2={idx * 83.3}
            stroke={WORLD_STATE_THEME.land.grid}
            strokeOpacity="0.25"
          />
        ))}

        {pins.map((pin) => {
          const x = ((pin.lng + 180) / 360) * MAP_WIDTH;
          const y = ((90 - pin.lat) / 180) * MAP_HEIGHT;
          const tone = pinTone(`${pin.title} ${pin.severity}`);
          const color = WORLD_STATE_THEME.signal[tone];
          return (
            <g key={pin.id}>
              <circle cx={x} cy={y} r={7} fill={color} fillOpacity="0.14" />
              <circle cx={x} cy={y} r={4} fill={color} fillOpacity="0.95" />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
