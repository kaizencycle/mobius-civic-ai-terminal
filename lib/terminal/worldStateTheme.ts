export const WORLD_STATE_THEME = {
  background: {
    nearBlack: '#020408',
    deepNavy: '#03101a',
    darkBlueBlack: '#020617',
  },
  land: {
    fill: '#0b2416',
    grid: '#123222',
    highlight: '#1b4d31',
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
