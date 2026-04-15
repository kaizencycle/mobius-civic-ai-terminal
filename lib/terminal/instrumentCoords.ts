import type { MicroSignal } from '@/lib/agents/micro/core';

export type InstrumentPin = {
  agentName: string;
  family: string;
  lat: number;
  lng: number;
  color: string;
  source: string;
  label: string;
  value: number;
  severity: string;
  healthy: boolean;
};

export const FAMILY_COLORS: Record<string, string> = {
  ATLAS: '#22d3ee',
  ZEUS: '#fbbf24',
  HERMES: '#fb7185',
  AUREA: '#f59e0b',
  JADE: '#34d399',
  DAEDALUS: '#a78bfa',
  ECHO: '#94a3b8',
  EVE: '#f43f5e',
};

const INSTRUMENT_COORDS: Record<string, [number, number]> = {
  'ATLAS-µ1': [38.9, -77.0],
  'ATLAS-µ2': [46.2, 6.1],
  'ATLAS-µ3': [38.9, -77.0],
  'ATLAS-µ4': [38.9, -77.0],
  'ATLAS-µ5': [40.7, -74.0],
  'ZEUS-µ1': [41.8, -87.6],
  'ZEUS-µ2': [42.4, -76.5],
  'ZEUS-µ4': [51.5, -0.1],
  'ZEUS-µ5': [37.8, -122.3],
  'HERMES-µ1': [37.4, -122.0],
  'HERMES-µ2': [37.4, -122.0],
  'HERMES-µ3': [38.9, -77.0],
  'HERMES-µ4': [37.8, -122.4],
  'HERMES-µ5': [28.5, -80.7],
  'AUREA-µ1': [38.9, -77.0],
  'AUREA-µ2': [38.9, -77.0],
  'AUREA-µ3': [38.9, -77.0],
  'AUREA-µ4': [39.0, -76.9],
  'AUREA-µ5': [38.9, -77.0],
  'JADE-µ1': [52.5, 13.4],
  'JADE-µ3': [40.8, -73.9],
  'JADE-µ4': [37.8, -122.3],
  'JADE-µ5': [51.5, -0.1],
  'DAEDALUS-µ1': [37.8, -122.4],
  'DAEDALUS-µ4': [37.8, -122.4],
  'DAEDALUS-µ5': [40.7, -74.0],
  'ECHO-µ1': [1.3, 103.8],
  'ECHO-µ2': [39.0, -77.0],
  'ECHO-µ3': [38.9, -76.8],
  'ECHO-µ4': [0.0, 0.0],
  'ECHO-µ5': [38.9, -76.8],
  'EVE-µ2': [52.4, 4.9],
  'EVE-µ3': [52.4, 4.9],
  'EVE-µ4': [52.4, 4.9],
  'EVE-µ5': [52.4, 4.9],
};

function familyFromAgent(agentName: string): string {
  const m = /^([A-Z]+)-µ\d+$/.exec(agentName);
  return m ? m[1]! : agentName;
}

export function pinRadiusForSeverity(severity: string): number {
  if (severity === 'critical') return 8;
  if (severity === 'elevated' || severity === 'watch') return 6;
  return 4;
}

export function shouldPulse(severity: string): boolean {
  return severity === 'critical' || severity === 'elevated' || severity === 'watch';
}

export function buildInstrumentPins(allSignals: MicroSignal[]): InstrumentPin[] {
  const pins: InstrumentPin[] = [];
  const seen = new Set<string>();

  for (const sig of allSignals) {
    const coords = INSTRUMENT_COORDS[sig.agentName];
    if (!coords) continue;
    if (seen.has(sig.agentName)) continue;
    seen.add(sig.agentName);

    const family = familyFromAgent(sig.agentName);
    pins.push({
      agentName: sig.agentName,
      family,
      lat: coords[0],
      lng: coords[1],
      color: FAMILY_COLORS[family] ?? '#94a3b8',
      source: sig.source,
      label: sig.label,
      value: sig.value,
      severity: sig.severity,
      healthy: typeof sig.value === 'number' && Number.isFinite(sig.value),
    });
  }

  return pins.filter((p) => p.healthy);
}
