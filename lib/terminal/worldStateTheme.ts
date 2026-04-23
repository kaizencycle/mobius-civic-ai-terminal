export const WORLD_STATE_THEME = {
  background: {
    nearBlack: '#020810',
    deepNavy: '#041220',
    darkBlueBlack: '#020617',
  },
  ocean: {
    deep: '#061428',
    mid: '#081830',
  },
  land: {
    fill: '#0a2a14',
    grid: '#0e3520',
    highlight: '#1a4d30',
  },
  chrome: {
    border: '#285245',
    accent: '#3a6f62',
  },
  signal: {
    nominal: '#1f9f67',
    elevated: '#f59e0b',
    critical: '#f43f5e',
    water: '#38bdf8',
    unknown: '#64748b',
  },
} as const;

export type WorldStateSignalTone = keyof typeof WORLD_STATE_THEME.signal;

export function toneToHexNumber(tone: WorldStateSignalTone): number {
  const hex = WORLD_STATE_THEME.signal[tone].slice(1);
  return Number.parseInt(hex, 16);
}
