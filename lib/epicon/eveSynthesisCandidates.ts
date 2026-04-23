/**
 * In-memory store for EVE → EPICON synthesis pipeline candidates (C-626).
 * Mirrors pipeline candidates for ZEUS/publish lookups; resets on cold start.
 */

import type { EpiconCandidate, ZeusSynthesisVerdict } from '@/lib/eve/synthesis-pipeline-store';

export type { ZeusSynthesisVerdict };
export type EveSynthesisCandidate = EpiconCandidate;

const store: EpiconCandidate[] = [];

export function addEveSynthesisCandidate(candidate: EpiconCandidate): void {
  store.unshift(candidate);
  if (store.length > 100) {
    store.length = 100;
  }
}

export function getEveSynthesisCandidates(): EveSynthesisCandidate[] {
  return store;
}

export function getEveSynthesisCandidateById(id: string): EveSynthesisCandidate | undefined {
  return store.find((c) => c.id === id);
}

export function updateEveSynthesisCandidate(
  id: string,
  patch: Partial<EpiconCandidate>,
): EpiconCandidate | undefined {
  const idx = store.findIndex((c) => c.id === id);
  if (idx === -1) return undefined;
  const next = { ...store[idx], ...patch };
  store[idx] = next;
  return next;
}

export function removeEveSynthesisCandidate(id: string): boolean {
  const idx = store.findIndex((c) => c.id === id);
  if (idx === -1) return false;
  store.splice(idx, 1);
  return true;
}
