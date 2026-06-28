/**
 * Reads ALL sealed Reserve Blocks from vault KV storage.
 *
 * Strategy:
 *   1. listAllSeals from vault-v2 store (primary — matches actual key layout)
 *   2. REST API fallback via /api/vault/blocks/all (for external runners)
 *
 * EPICON: C-357 | RESERVE_BLOCK_DAT_CANONIZATION
 */

import { listAllSeals } from '@/lib/vault-v2/store';
import type { Seal } from '@/lib/vault-v2/types';
import { sealToVaultBlock, type VaultSealedBlock } from '@/lib/dat/types';

const PAGE_SIZE = 50;
const MAX_BLOCKS = 10_000;

export interface FetchBlocksOptions {
  forceApi?: boolean;
  fromBlock?: number;
  toBlock?: number;
  verbose?: boolean;
}

export interface FetchBlocksResult {
  blocks: VaultSealedBlock[];
  total_found: number;
  source: 'kv' | 'api';
  gaps: number[];
  errors: string[];
}

export async function fetchAllSealedBlocks(
  opts: FetchBlocksOptions = {},
): Promise<FetchBlocksResult> {
  const {
    forceApi = false,
    fromBlock = 1,
    toBlock = MAX_BLOCKS,
    verbose = false,
  } = opts;

  const errors: string[] = [];

  if (!forceApi) {
    try {
      return await fetchViaKv({ fromBlock, toBlock, verbose, errors });
    } catch (e) {
      const msg = `KV fetch failed: ${e instanceof Error ? e.message : String(e)}`;
      errors.push(msg);
      if (verbose) console.warn(`[fetchAllSealedBlocks] ${msg} — falling back to API`);
    }
  }

  return fetchViaApi({ fromBlock, toBlock, verbose, errors });
}

async function fetchViaKv(opts: {
  fromBlock: number;
  toBlock: number;
  verbose: boolean;
  errors: string[];
}): Promise<FetchBlocksResult> {
  const { fromBlock, toBlock, verbose, errors } = opts;

  const seals = await listAllSeals(MAX_BLOCKS);
  const finalized = seals.filter(
    (s) => s.status === 'attested' || s.status === 'quarantined',
  );

  if (verbose) {
    console.log(`[fetchAllSealedBlocks] KV: ${finalized.length} finalized seals`);
  }

  const blocks = finalized
    .map(sealToVaultBlock)
    .filter((b) => b.block_number >= fromBlock && b.block_number <= toBlock)
    .sort((a, b) => a.block_number - b.block_number);

  const gaps = findGaps(blocks.map((b) => b.block_number));

  return {
    blocks,
    total_found: blocks.length,
    source: 'kv',
    gaps,
    errors,
  };
}

async function fetchViaApi(opts: {
  fromBlock: number;
  toBlock: number;
  verbose: boolean;
  errors: string[];
}): Promise<FetchBlocksResult> {
  const { fromBlock, toBlock, verbose, errors } = opts;

  const base =
    process.env.TERMINAL_API_BASE ??
    process.env.NEXT_PUBLIC_TERMINAL_API_BASE ??
    'http://localhost:3000';
  const token = process.env.AGENT_SERVICE_TOKEN;

  if (!token) {
    throw new Error('AGENT_SERVICE_TOKEN not set — cannot call vault API');
  }

  const blocks: VaultSealedBlock[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const url = `${base.replace(/\/$/, '')}/api/vault/blocks/all?page=${page}&limit=${PAGE_SIZE}&from=${fromBlock}&to=${toBlock}`;

    if (verbose) console.log(`[fetchAllSealedBlocks] API page ${page}`);

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Vault API ${res.status}: ${body}`);
    }

    const json = (await res.json()) as {
      blocks: VaultSealedBlock[];
      has_more: boolean;
    };

    blocks.push(...json.blocks);
    hasMore = json.has_more;
    page++;
  }

  blocks.sort((a, b) => a.block_number - b.block_number);
  const gaps = findGaps(blocks.map((b) => b.block_number));

  return {
    blocks,
    total_found: blocks.length,
    source: 'api',
    gaps,
    errors,
  };
}

function findGaps(sortedNumbers: number[]): number[] {
  if (sortedNumbers.length === 0) return [];
  const gaps: number[] = [];
  const min = sortedNumbers[0];
  const max = sortedNumbers[sortedNumbers.length - 1];
  const set = new Set(sortedNumbers);
  for (let i = min; i <= max; i++) {
    if (!set.has(i)) gaps.push(i);
  }
  return gaps;
}

/** Export seals for API route (reuses same filter logic). */
export async function fetchSealedSealsForApi(
  fromBlock: number,
  toBlock: number,
  limit: number,
  offset: number,
): Promise<{ seals: Seal[]; total: number }> {
  const seals = await listAllSeals(MAX_BLOCKS);
  const finalized = seals
    .filter((s) => s.status === 'attested' || s.status === 'quarantined')
    .filter((s) => s.sequence >= fromBlock && s.sequence <= toBlock)
    .sort((a, b) => a.sequence - b.sequence);

  const page = finalized.slice(offset, offset + limit);
  return { seals: page, total: finalized.length };
}
