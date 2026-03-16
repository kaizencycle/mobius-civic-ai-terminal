'use client';

/**
 * MIC Wallet Context for Mobius Civic AI Terminal
 *
 * Manages the operator's MIC wallet state using a client-side blockchain.
 * No auth dependency — the terminal operates in operator mode.
 *
 * Architecture:
 * - Local blockchain: Client-side SHA-256 hash-linked chain (source of truth)
 * - Wallet balance is derived from on-chain transactions (never stored directly)
 * - Integrity engine can mint MIC via earnMIC() when MII >= 0.95
 */
import { createContext, useContext, useCallback, type ReactNode } from 'react';
import { useMICBlockchain, type MICBlock, type MICTransaction, type ChainStats } from '@/hooks/useMICBlockchain';

const OPERATOR_ID = 'terminal-operator';

interface WalletContextType {
  balance: number;
  blockchain: MICBlock[];
  chainStats: ChainStats;
  chainLoading: boolean;
  earnMIC: (source: string, amount: number, meta?: Record<string, unknown>) => Promise<MICBlock | null>;
  burnMIC: (amount: number, source: string, meta?: Record<string, unknown>) => Promise<MICBlock | null>;
  getChainBalance: (recipient: string) => number;
  getChainTransactions: (recipient: string) => (MICTransaction & { blockIndex: number; blockHash: string; timestamp: string })[];
  getAllHolders: () => { recipient: string; balance: number; txCount: number }[];
  verifyChain: () => Promise<boolean>;
  getBlock: (index: number) => MICBlock | null;
  operatorId: string;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: ReactNode }) {
  const {
    chain: blockchain,
    stats: chainStats,
    loading: chainLoading,
    addBlock,
    getBalance: getChainBalance,
    getTransactions: getChainTransactions,
    getAllHolders,
    verifyChain,
    getBlock,
  } = useMICBlockchain();

  const balance = getChainBalance(OPERATOR_ID);

  const earnMIC = useCallback(
    async (source: string, amount: number, meta?: Record<string, unknown>): Promise<MICBlock | null> => {
      if (amount <= 0) return null;
      const tx: MICTransaction = {
        source,
        amount: Math.round(amount * 1000000) / 1000000,
        recipient: OPERATOR_ID,
        meta,
      };
      return addBlock([tx]);
    },
    [addBlock],
  );

  const burnMIC = useCallback(
    async (amount: number, source: string, meta?: Record<string, unknown>): Promise<MICBlock | null> => {
      const burnAmount = Math.round(amount * 100) / 100;
      if (!Number.isFinite(burnAmount) || burnAmount <= 0) return null;
      if (getChainBalance(OPERATOR_ID) < burnAmount) return null;
      const tx: MICTransaction = {
        source,
        amount: -burnAmount,
        recipient: OPERATOR_ID,
        meta: { ...(meta || {}), burn: true },
      };
      return addBlock([tx]);
    },
    [addBlock, getChainBalance],
  );

  return (
    <WalletContext.Provider
      value={{
        balance,
        blockchain,
        chainStats,
        chainLoading,
        earnMIC,
        burnMIC,
        getChainBalance,
        getChainTransactions,
        getAllHolders,
        verifyChain,
        getBlock,
        operatorId: OPERATOR_ID,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) throw new Error('useWallet must be used within WalletProvider');
  return context;
}
