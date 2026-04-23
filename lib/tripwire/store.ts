export type RuntimeTripwireLevel = 'none' | 'watch' | 'elevated' | 'nominal' | 'low' | 'medium' | 'high' | 'triggered' | 'suspended';

export type RuntimeTripwireState = {
  active: boolean;
  level: RuntimeTripwireLevel;
  reason: string;
  last_updated: string;
  triggeredBy?: 'HERMES' | 'ZEUS' | 'ATLAS' | 'operator';
};

let tripwireState: RuntimeTripwireState = {
  active: false,
  level: 'none',
  reason: 'No active tripwires - baseline state',
  last_updated: new Date().toISOString(),
};

export function setTripwireState(next: RuntimeTripwireState) {
  tripwireState = next;
}

export function getTripwireState() {
  return tripwireState;
}
