// C-328: getGiMode and GIMode are now canonical in lib/gi/bands.ts.
// Re-exported here for backwards compatibility.
export type { GIMode } from './bands.js';
export { getGiMode } from './bands.js';

export const giModeConfig = {
  green: {
    label: 'Expansion',
    rewardMultiplier: 1.0,
    burnMultiplier: 1.0,
    minStakeOptions: [0, 1, 3],
    visibilityThreshold: 0.35,
    tone: 'green',
  },
  yellow: {
    label: 'Stabilization',
    rewardMultiplier: 1.5,
    burnMultiplier: 1.0,
    minStakeOptions: [1, 3, 5],
    visibilityThreshold: 0.5,
    tone: 'yellow',
  },
  red: {
    label: 'Defense',
    rewardMultiplier: 2.0,
    burnMultiplier: 1.5,
    minStakeOptions: [3, 5, 8],
    visibilityThreshold: 0.7,
    tone: 'red',
  },
} as const;
