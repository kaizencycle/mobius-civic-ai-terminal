'use client';

/**
 * MIC Blockchain Explorer — Block explorer for the local MIC chain.
 *
 * Shows chain integrity status, stats grid, holder table, and expandable
 * block cards with hash details and transactions.
 * Dark theme, adapted from mobius-browser-shell.
 */

import { useState } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import type { MICBlock } from '@/hooks/useMICBlockchain';
import SectionLabel from './SectionLabel';

// ─── Source labels ──────────────────────────────────────────

const SOURCE_LABELS: Record<string, { icon: string; label: string }> = {
  genesis: { icon: '\u{1F300}', label: 'Genesis' },
  echo_integrity_mint: { icon: '\u{26D3}\uFE0F', label: 'Integrity Mint' },
  learning_module: { icon: '\u{1F4DA}', label: 'Learning Module' },
  civic_action: { icon: '\u{1F3DB}\uFE0F', label: 'Civic Action' },
  verification: { icon: '\u{2705}', label: 'Verification' },
  attestation: { icon: '\u{1F4DC}', label: 'Attestation' },
  shard_reward: { icon: '\u{2B22}', label: 'Shard Reward' },
};

function sourceLabel(source: string) {
  return SOURCE_LABELS[source] ?? { icon: '\u{1F48E}', label: source };
}

function shortHash(hash: string, len = 8) {
  if (!hash) return '\u2014';
  return `${hash.slice(0, len)}...${hash.slice(-len)}`;
}

// ─── Block Card ─────────────────────────────────────────────

function BlockCard({
  block,
  isExpanded,
  onToggle,
  isGenesis,
}: {
  block: MICBlock;
  isExpanded: boolean;
  onToggle: () => void;
  isGenesis: boolean;
}) {
  const totalMic = block.transactions.reduce((s, tx) => s + tx.amount, 0);

  return (
    <div className={`border rounded-lg overflow-hidden transition-all ${
      isGenesis
        ? 'border-amber-500/30 bg-amber-500/5'
        : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'
    }`}>
      <button onClick={onToggle} className="w-full text-left px-3 py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-8 h-8 rounded-md flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
            isGenesis ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-800 text-slate-400'
          }`}>
            #{block.index}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-medium text-slate-200 truncate">
              {isGenesis ? 'Genesis Block' : `Block #${block.index}`}
            </div>
            <div className="text-[10px] font-mono text-slate-600 truncate">{shortHash(block.hash)}</div>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {totalMic > 0 && (
            <span className="text-xs font-bold text-amber-400">+{totalMic.toLocaleString()} MIC</span>
          )}
          <span className="text-[10px] text-slate-600">{block.transactions.length} tx</span>
          <span className="text-slate-600 text-xs">{isExpanded ? '\u25B2' : '\u25BC'}</span>
        </div>
      </button>

      {isExpanded && (
        <div className="px-3 pb-3 border-t border-slate-800/60 pt-2.5 space-y-2.5">
          {/* Hash details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px]">
            <div className="bg-slate-800/50 rounded-md p-2">
              <div className="text-slate-500 mb-0.5">Block Hash</div>
              <div className="font-mono text-slate-300 break-all leading-relaxed">{block.hash}</div>
            </div>
            <div className="bg-slate-800/50 rounded-md p-2">
              <div className="text-slate-500 mb-0.5">Previous Hash</div>
              <div className="font-mono text-slate-300 break-all leading-relaxed">
                {block.previousHash === '0'.repeat(64) ? '0\u00D764 (genesis)' : block.previousHash}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-[10px]">
            <div className="bg-slate-800/50 rounded-md p-2">
              <div className="text-slate-500">Nonce</div>
              <div className="font-mono text-slate-300">{block.nonce}</div>
            </div>
            <div className="bg-slate-800/50 rounded-md p-2">
              <div className="text-slate-500">Merkle Root</div>
              <div className="font-mono text-slate-300 truncate" title={block.merkleRoot}>
                {shortHash(block.merkleRoot, 6)}
              </div>
            </div>
            <div className="bg-slate-800/50 rounded-md p-2">
              <div className="text-slate-500">Timestamp</div>
              <div className="text-slate-300">
                {new Date(block.timestamp).toLocaleString('en-US', {
                  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                })}
              </div>
            </div>
          </div>

          {/* Transactions */}
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wide text-slate-500 mb-1.5">
              Transactions ({block.transactions.length})
            </div>
            <div className="space-y-1">
              {block.transactions.map((tx, idx) => {
                const src = sourceLabel(tx.source);
                return (
                  <div key={idx} className="flex items-center justify-between text-[11px] bg-slate-800/40 rounded px-2.5 py-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span>{src.icon}</span>
                      <span className="text-slate-300">{src.label}</span>
                      <span className="text-slate-600">{'\u2192'}</span>
                      <span className="font-mono text-slate-500 truncate max-w-[100px]" title={tx.recipient}>
                        {tx.recipient.length > 16 ? shortHash(tx.recipient, 6) : tx.recipient}
                      </span>
                    </div>
                    <span className={`font-bold flex-shrink-0 ${tx.amount > 0 ? 'text-amber-400' : tx.amount < 0 ? 'text-red-400' : 'text-slate-500'}`}>
                      {tx.amount > 0 ? '+' : ''}{tx.amount} MIC
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Explorer ──────────────────────────────────────────

export default function MICBlockchainExplorer() {
  const { blockchain, chainStats, chainLoading, getAllHolders, verifyChain, operatorId, getChainBalance } = useWallet();

  const [expandedBlock, setExpandedBlock] = useState<number | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [showAllBlocks, setShowAllBlocks] = useState(false);

  const userBalance = getChainBalance(operatorId);
  const holders = getAllHolders();
  const displayBlocks = [...blockchain].reverse();
  const blocksToShow = showAllBlocks ? displayBlocks : displayBlocks.slice(0, 10);

  const handleVerify = async () => {
    setVerifying(true);
    await verifyChain();
    setTimeout(() => setVerifying(false), 1200);
  };

  if (chainLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-400 font-mono text-sm">
        Initializing MIC blockchain...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SectionLabel title="MIC Blockchain" subtitle="SHA-256 hash-linked chain with proof-of-work" />

      {/* Chain Status Banner */}
      <div className={`rounded-xl p-4 border ${
        chainStats.isValid
          ? 'bg-emerald-500/5 border-emerald-500/30'
          : 'bg-red-500/5 border-red-500/30'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className={`font-bold text-sm ${chainStats.isValid ? 'text-emerald-400' : 'text-red-400'}`}>
              {chainStats.isValid ? 'Chain Integrity Verified' : 'Chain Integrity Compromised'}
            </h3>
            <p className={`text-[10px] ${chainStats.isValid ? 'text-emerald-500/70' : 'text-red-500/70'}`}>
              {chainStats.length} blocks · {chainStats.totalTransactions} transactions · SHA-256 · Difficulty {chainStats.difficulty}
            </p>
          </div>
          <button
            onClick={handleVerify}
            disabled={verifying}
            className={`px-3 py-1.5 rounded-md text-[10px] font-bold transition-all flex-shrink-0 ${
              verifying
                ? 'bg-slate-800 text-slate-500 cursor-wait'
                : chainStats.isValid
                ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30'
                : 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30'
            }`}
          >
            {verifying ? 'Verifying...' : 'Verify Chain'}
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: 'Blocks', value: chainStats.length, color: 'text-slate-200' },
          { label: 'MIC Minted', value: chainStats.totalMicMinted.toLocaleString(), color: 'text-amber-400' },
          { label: 'Transactions', value: chainStats.totalTransactions, color: 'text-slate-200' },
          { label: 'Holders', value: holders.length, color: 'text-violet-400' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-center">
            <div className={`text-lg font-bold ${stat.color}`}>{stat.value}</div>
            <div className="text-[10px] text-slate-500">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Operator Balance */}
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 flex items-center justify-between">
        <div>
          <div className="text-[10px] text-amber-500/70 uppercase tracking-wide font-medium mb-0.5">
            Your On-Chain Balance
          </div>
          <div className="text-2xl font-black text-amber-400 font-mono">
            {userBalance.toLocaleString()} MIC
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5 font-mono">{operatorId}</div>
        </div>
        <div className="text-right hidden sm:block">
          <div className="text-[10px] text-slate-500">Latest Block</div>
          <div className="font-mono text-[10px] text-slate-400">
            {chainStats.latestHash ? shortHash(chainStats.latestHash) : '\u2014'}
          </div>
        </div>
      </div>

      {/* Holders Table */}
      {holders.length > 0 && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-800">
            <span className="text-[10px] font-mono uppercase tracking-wide text-slate-500">
              MIC Holders ({holders.length})
            </span>
          </div>
          <div className="divide-y divide-slate-800/50">
            {holders.map((holder, idx) => (
              <div key={holder.recipient} className="flex items-center justify-between px-3 py-2 hover:bg-slate-800/30 transition-colors">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-slate-600 w-5 text-right">#{idx + 1}</span>
                  <div>
                    <div className="text-xs font-mono text-slate-300">
                      {holder.recipient.length > 24 ? shortHash(holder.recipient, 10) : holder.recipient}
                    </div>
                    <div className="text-[10px] text-slate-600">{holder.txCount} transactions</div>
                  </div>
                </div>
                <span className="text-xs font-bold text-amber-400">{holder.balance.toLocaleString()} MIC</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Block Explorer */}
      <div>
        <div className="text-[10px] font-mono uppercase tracking-wide text-slate-500 mb-2">
          Block Explorer (most recent first)
        </div>
        <div className="space-y-1.5">
          {blocksToShow.map((block) => (
            <BlockCard
              key={block.index}
              block={block}
              isGenesis={block.index === 0}
              isExpanded={expandedBlock === block.index}
              onToggle={() => setExpandedBlock(expandedBlock === block.index ? null : block.index)}
            />
          ))}
        </div>
        {blockchain.length > 10 && (
          <button
            onClick={() => setShowAllBlocks(!showAllBlocks)}
            className="w-full mt-2 py-1.5 text-[10px] text-slate-500 hover:text-slate-300 font-medium transition-colors"
          >
            {showAllBlocks ? `Show recent 10 blocks` : `Show all ${blockchain.length} blocks`}
          </button>
        )}
      </div>

      {/* Footer */}
      <div className="text-center text-[10px] text-slate-600 py-1">
        Local chain · SHA-256 PoW (difficulty {chainStats.difficulty}) · Testnet
      </div>
    </div>
  );
}
