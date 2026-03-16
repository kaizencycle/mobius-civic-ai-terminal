'use client';

/**
 * MIC Blockchain Engine
 *
 * Client-side SHA-256 hash-linked blockchain for MIC (Mobius Integrity Credits).
 * Ported from mobius-browser-shell, adapted for Next.js terminal.
 *
 * Every MIC earning event is recorded as a block with:
 *   - SHA-256 hash linking to the previous block
 *   - Timestamp, nonce, merkle root, and transaction data
 *   - Chain integrity verification via Web Crypto API
 *
 * Persists to localStorage. On mainnet, syncs with distributed ledger.
 */
import { useState, useEffect, useCallback, useRef } from 'react';

// ─── Block & Chain Types ─────────────────────────────────────

export interface MICTransaction {
  source: string;
  amount: number;
  recipient: string;
  meta?: Record<string, unknown>;
}

export interface MICBlock {
  index: number;
  timestamp: string;
  transactions: MICTransaction[];
  previousHash: string;
  hash: string;
  nonce: number;
  merkleRoot: string;
}

export interface ChainStats {
  length: number;
  totalMicMinted: number;
  totalTransactions: number;
  isValid: boolean;
  genesisTimestamp: string | null;
  latestTimestamp: string | null;
  latestHash: string;
  difficulty: number;
}

// ─── Crypto Utilities (Web Crypto API) ───────────────────────

async function sha256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const buffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function computeMerkleRoot(transactions: MICTransaction[]): Promise<string> {
  if (transactions.length === 0) return await sha256('empty');
  const leaves = await Promise.all(
    transactions.map(tx => sha256(JSON.stringify(tx)))
  );
  let level = leaves;
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] ?? left;
      next.push(await sha256(left + right));
    }
    level = next;
  }
  return level[0];
}

async function computeBlockHash(block: Omit<MICBlock, 'hash'>): Promise<string> {
  const data = [
    block.index,
    block.timestamp,
    block.previousHash,
    block.merkleRoot,
    block.nonce,
    JSON.stringify(block.transactions),
  ].join('|');
  return sha256(data);
}

// ─── Proof-of-Work (lightweight, educational) ────────────────

const DIFFICULTY = 2;

async function mineBlock(
  block: Omit<MICBlock, 'hash' | 'nonce'>,
): Promise<{ hash: string; nonce: number }> {
  let nonce = 0;
  const prefix = '0'.repeat(DIFFICULTY);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const candidate = await computeBlockHash({ ...block, nonce });
    if (candidate.startsWith(prefix)) {
      return { hash: candidate, nonce };
    }
    nonce++;
    if (nonce > 500_000) {
      return { hash: candidate, nonce };
    }
  }
}

// ─── Chain Validation ────────────────────────────────────────

async function validateChain(chain: MICBlock[]): Promise<boolean> {
  if (chain.length === 0) return true;
  if (chain[0].previousHash !== '0'.repeat(64)) return false;

  for (let i = 1; i < chain.length; i++) {
    const current = chain[i];
    const previous = chain[i - 1];
    if (current.previousHash !== previous.hash) return false;
    const expectedHash = await computeBlockHash({
      index: current.index,
      timestamp: current.timestamp,
      transactions: current.transactions,
      previousHash: current.previousHash,
      merkleRoot: current.merkleRoot,
      nonce: current.nonce,
    });
    if (current.hash !== expectedHash) return false;
  }
  return true;
}

// ─── Genesis Block ───────────────────────────────────────────

async function createGenesisBlock(): Promise<MICBlock> {
  const tx: MICTransaction = {
    source: 'genesis',
    amount: 0,
    recipient: 'mobius-system',
    meta: { message: 'Mobius Integrity Credits — Genesis Block', version: '1.0.0' },
  };

  const timestamp = new Date().toISOString();
  const previousHash = '0'.repeat(64);
  const merkleRoot = await computeMerkleRoot([tx]);
  const partial = { index: 0, timestamp, transactions: [tx], previousHash, merkleRoot };
  const { hash, nonce } = await mineBlock(partial);
  return { ...partial, hash, nonce };
}

// ─── localStorage Persistence ────────────────────────────────

const STORAGE_KEY = 'mobius_mic_blockchain';

function loadChain(): MICBlock[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveChain(chain: MICBlock[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chain));
  } catch {
    console.warn('Failed to persist MIC blockchain to localStorage');
  }
}

// ─── Compute Stats ───────────────────────────────────────────

function computeStats(chain: MICBlock[], isValid: boolean): ChainStats {
  let totalMicMinted = 0;
  let totalTransactions = 0;

  for (const block of chain) {
    for (const tx of block.transactions) {
      totalMicMinted += tx.amount;
      totalTransactions++;
    }
  }

  return {
    length: chain.length,
    totalMicMinted: Math.round(totalMicMinted * 100) / 100,
    totalTransactions,
    isValid,
    genesisTimestamp: chain.length > 0 ? chain[0].timestamp : null,
    latestTimestamp: chain.length > 0 ? chain[chain.length - 1].timestamp : null,
    latestHash: chain.length > 0 ? chain[chain.length - 1].hash : '',
    difficulty: DIFFICULTY,
  };
}

// ─── React Hook ──────────────────────────────────────────────

export function useMICBlockchain() {
  const [chain, setChain] = useState<MICBlock[]>([]);
  const [stats, setStats] = useState<ChainStats>({
    length: 0,
    totalMicMinted: 0,
    totalTransactions: 0,
    isValid: true,
    genesisTimestamp: null,
    latestTimestamp: null,
    latestHash: '',
    difficulty: DIFFICULTY,
  });
  const [loading, setLoading] = useState(true);
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    (async () => {
      setLoading(true);
      let loaded = loadChain();
      if (loaded.length === 0) {
        const genesis = await createGenesisBlock();
        loaded = [genesis];
        saveChain(loaded);
      }
      const valid = await validateChain(loaded);
      setChain(loaded);
      setStats(computeStats(loaded, valid));
      setLoading(false);
    })();
  }, []);

  const addBlock = useCallback(
    async (transactions: MICTransaction[]): Promise<MICBlock | null> => {
      if (chain.length === 0) return null;
      const previousBlock = chain[chain.length - 1];
      const timestamp = new Date().toISOString();
      const merkleRoot = await computeMerkleRoot(transactions);
      const partial = {
        index: previousBlock.index + 1,
        timestamp,
        transactions,
        previousHash: previousBlock.hash,
        merkleRoot,
      };
      const { hash, nonce } = await mineBlock(partial);
      const newBlock: MICBlock = { ...partial, hash, nonce };
      const updatedChain = [...chain, newBlock];
      const valid = await validateChain(updatedChain);
      setChain(updatedChain);
      setStats(computeStats(updatedChain, valid));
      saveChain(updatedChain);
      return newBlock;
    },
    [chain],
  );

  const getBalance = useCallback(
    (recipient: string): number => {
      let balance = 0;
      for (const block of chain) {
        for (const tx of block.transactions) {
          if (tx.recipient === recipient) balance += tx.amount;
        }
      }
      return Math.round(balance * 100) / 100;
    },
    [chain],
  );

  const getTransactions = useCallback(
    (recipient: string) => {
      const result: (MICTransaction & { blockIndex: number; blockHash: string; timestamp: string })[] = [];
      for (const block of chain) {
        for (const tx of block.transactions) {
          if (tx.recipient === recipient) {
            result.push({ ...tx, blockIndex: block.index, blockHash: block.hash, timestamp: block.timestamp });
          }
        }
      }
      return result.reverse();
    },
    [chain],
  );

  const getAllHolders = useCallback((): { recipient: string; balance: number; txCount: number }[] => {
    const holders: Record<string, { balance: number; txCount: number }> = {};
    for (const block of chain) {
      for (const tx of block.transactions) {
        if (tx.recipient === 'mobius-system') continue;
        if (!holders[tx.recipient]) holders[tx.recipient] = { balance: 0, txCount: 0 };
        holders[tx.recipient].balance += tx.amount;
        holders[tx.recipient].txCount++;
      }
    }
    return Object.entries(holders)
      .map(([recipient, data]) => ({
        recipient,
        balance: Math.round(data.balance * 100) / 100,
        txCount: data.txCount,
      }))
      .sort((a, b) => b.balance - a.balance);
  }, [chain]);

  const verifyChain = useCallback(async (): Promise<boolean> => {
    const valid = await validateChain(chain);
    setStats(prev => ({ ...prev, isValid: valid }));
    return valid;
  }, [chain]);

  const getBlock = useCallback(
    (index: number): MICBlock | null => chain[index] ?? null,
    [chain],
  );

  return {
    chain,
    stats,
    loading,
    addBlock,
    getBalance,
    getTransactions,
    getAllHolders,
    verifyChain,
    getBlock,
  };
}
