// C-305 OPT-04: HERMES µ3/µ4 narrative signal computation.
// µ3 = cross-agent narrative coherence (consensus density among high-confidence signals)
// µ4 = signal-to-noise ratio (fraction of signals above confidence threshold)

import type { MicroSignal } from '@/lib/agents/micro/core';

export interface HermesNarrativeResult {
  mu3: number;
  mu4: number;
  label: string;
  computed: boolean;
}

const CONFIDENCE_THRESHOLD = 0.70;
const CONSENSUS_BAND = 0.12;

export function computeHermesNarrative(hermesSignals: MicroSignal[]): HermesNarrativeResult {
  if (!hermesSignals?.length) {
    return { mu3: 0, mu4: 0, label: 'no-data', computed: false };
  }

  const total = hermesSignals.length;

  // µ4: fraction of signals at or above confidence threshold
  const highConf = hermesSignals.filter((s) => s.value >= CONFIDENCE_THRESHOLD);
  const mu4 = +(highConf.length / total).toFixed(3);

  // µ3: fraction of high-confidence signals that agree within consensus band of their mean
  let mu3 = 0;
  if (highConf.length >= 2) {
    const mean = highConf.reduce((sum, s) => sum + s.value, 0) / highConf.length;
    const consensual = highConf.filter((s) => Math.abs(s.value - mean) <= CONSENSUS_BAND);
    mu3 = +(consensual.length / total).toFixed(3);
  }

  return {
    mu3,
    mu4,
    label: highConf.length >= 2 ? 'hermes-derived' : 'insufficient-signals',
    computed: true,
  };
}
