export type RuntimeTripwireState = {
  active: boolean;
  level: 'none' | 'watch' | 'elevated';
  reason: string;
  last_updated: string;
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
