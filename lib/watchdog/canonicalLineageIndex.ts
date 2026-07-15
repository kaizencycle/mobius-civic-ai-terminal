/**
 * C-373 derived canonical lineage index — never mutates sealed seal records.
 */

import { kvGet, kvSet } from '@/lib/kv/store';

export const QUARANTINED_SEALS_KEY = 'watchdog:canonical:quarantined';

function blockKey(block_number: number): string {
  return `watchdog:canonical:block:${block_number}`;
}

export async function getCanonicalSealForBlock(block_number: number): Promise<string | null> {
  return kvGet<string>(blockKey(block_number));
}

export async function setCanonicalSealForBlock(
  block_number: number,
  seal_id: string,
): Promise<string | null> {
  const prior = await getCanonicalSealForBlock(block_number);
  await kvSet(blockKey(block_number), seal_id);
  return prior;
}

export async function listQuarantinedSealIds(): Promise<string[]> {
  return (await kvGet<string[]>(QUARANTINED_SEALS_KEY)) ?? [];
}

export async function appendQuarantinedSealIds(seal_ids: string[]): Promise<string[]> {
  const prior = await listQuarantinedSealIds();
  const next = [...prior];
  for (const id of seal_ids) {
    if (!next.includes(id)) next.push(id);
  }
  await kvSet(QUARANTINED_SEALS_KEY, next);
  return prior;
}

export async function isSealQuarantined(seal_id: string): Promise<boolean> {
  const list = await listQuarantinedSealIds();
  return list.includes(seal_id);
}
