import fs from 'node:fs/promises';
import type { SealRecord, TrancheState } from '@/lib/seal/types';

const TRANCHE_PATH = './data/tranche.json';
const SEALS_PATH = './data/seals.json';

const defaultTranche: TrancheState = {
  tranche_id: 'tranche-001',
  cycle_opened: 'C-288',
  current_units: 0,
  target_units: 50,
  sealed: false,
  sealed_reserve_total: 0,
};

export async function getTrancheState(): Promise<TrancheState> {
  try {
    const raw = await fs.readFile(TRANCHE_PATH, 'utf-8');
    return JSON.parse(raw) as TrancheState;
  } catch {
    return defaultTranche;
  }
}

export async function persistTranche(state: TrancheState) {
  await fs.mkdir('./data', { recursive: true });
  await fs.writeFile(TRANCHE_PATH, JSON.stringify(state, null, 2));
}

export async function listSeals(): Promise<SealRecord[]> {
  try {
    const raw = await fs.readFile(SEALS_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as SealRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function getSealByTrancheId(trancheId: string): Promise<SealRecord | null> {
  const seals = await listSeals();
  return seals.find((seal) => seal.tranche_id === trancheId) ?? null;
}

export async function persistSeal(seal: SealRecord) {
  const seals = await listSeals();
  if (seals.some((existing) => existing.tranche_id === seal.tranche_id)) {
    return;
  }

  seals.push(seal);
  await fs.mkdir('./data', { recursive: true });
  await fs.writeFile(SEALS_PATH, JSON.stringify(seals, null, 2));
}
