import type { MobiusCivicIntegritySignal } from '@/lib/integrity-signal';

let latestIntegritySignal: MobiusCivicIntegritySignal | null = null;

export function setLatestIntegritySignal(signal: MobiusCivicIntegritySignal): void {
  latestIntegritySignal = signal;
}

export function getLatestIntegritySignal(): MobiusCivicIntegritySignal | null {
  return latestIntegritySignal;
}
