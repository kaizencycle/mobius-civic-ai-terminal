'use client';

/**
 * MIC Wallet Panel — Fractal Wallet overview for the terminal.
 *
 * Shows operator balance, MII circuit breaker status, MIA allocation track,
 * UBI dividend preview, and recent on-chain transactions.
 * Dark theme, adapted from mobius-browser-shell WalletLab.
 */

import { useWallet } from '@/contexts/WalletContext';
import type { GISnapshot } from '@/lib/terminal/types';
import type { CycleIntegritySummary } from '@/lib/echo/integrity-engine';
import SectionLabel from './SectionLabel';

const MII_THRESHOLD = 0.95;

// Earning source labels
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

export default function MICWalletPanel({
  gi,
  integrity,
}: {
  gi: GISnapshot | null;
  integrity: CycleIntegritySummary | null;
}) {
  const { balance, blockchain, chainStats, chainLoading, operatorId } = useWallet();

  const mii = integrity?.avgMii ?? (gi ? gi.score : 0);
  const mintingActive = mii >= MII_THRESHOLD;
  const miiPercent = Math.min(mii * 100, 100);

  // Recent transactions (from blockchain, most recent first)
  const recentTxs = [...blockchain]
    .reverse()
    .flatMap(block =>
      block.transactions
        .filter(tx => tx.recipient === operatorId)
        .map(tx => ({
          ...tx,
          blockIndex: block.index,
          blockHash: block.hash,
          timestamp: block.timestamp,
        }))
    )
    .slice(0, 8);

  if (chainLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-400 font-mono text-sm">
        Initializing MIC blockchain...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SectionLabel title="Fractal Wallet" subtitle="MIC balance, minting status, and on-chain activity" />

      {/* ── Balance + Identity ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500">
            Operator {operatorId}
          </div>
          <div className="text-3xl sm:text-4xl font-mono font-bold text-slate-100 mt-1">
            <span className="text-xl text-slate-500 mr-1">{'\u25A3'}</span>
            {balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            <span className="text-base text-slate-500 ml-2">MIC</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-slate-500">On-Chain</div>
          <div className="text-xs font-mono text-slate-400">
            {chainStats.length} blocks · {chainStats.totalTransactions} txs
          </div>
          <div className="text-xs font-mono text-slate-500 mt-0.5">
            {chainStats.latestHash ? shortHash(chainStats.latestHash) : '\u2014'}
          </div>
        </div>
      </div>

      {/* ── Top Cards: MII + MIA + UBI ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* MII Circuit Breaker */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 relative overflow-hidden">
          <div className="text-[10px] font-mono uppercase tracking-[0.15em] text-slate-500 mb-2">
            System Integrity (MII)
          </div>
          <div className="flex items-end gap-2 mb-2">
            <span className="text-3xl font-mono font-bold text-slate-100">{mii.toFixed(3)}</span>
            <span className="text-xs text-slate-500 pb-1">/ 1.00</span>
          </div>
          <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden mb-3">
            <div
              className={`h-full transition-all duration-500 ${mintingActive ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-amber-500'}`}
              style={{ width: `${miiPercent}%` }}
            />
          </div>
          <div className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
            mintingActive
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
              : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
          }`}>
            {mintingActive ? '\u26A1 MINTING ACTIVE' : '\u23F8 MINTING PAUSED'}
          </div>
        </div>

        {/* MIA Allocation Track */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="text-[10px] font-mono uppercase tracking-[0.15em] text-slate-500 mb-2">
            MIA Track
          </div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-slate-400">Total Minted</span>
            <span className="font-mono text-slate-200">{chainStats.totalMicMinted.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between text-xs mb-3">
            <span className="text-slate-400">Cycle MIC</span>
            <span className="font-mono text-emerald-400">
              +{((integrity?.totalMicProvisional ?? integrity?.totalMicMinted) ?? 0).toFixed(4)}
            </span>
          </div>
          <div className="p-2 bg-slate-800/60 rounded-lg border border-slate-700/50">
            <div className="text-[10px] text-slate-500 mb-0.5">GI Delta (Cycle)</div>
            <div className="text-sm font-mono text-slate-200">
              {integrity ? (integrity.totalGiDelta >= 0 ? '+' : '') + integrity.totalGiDelta.toFixed(4) : '\u2014'}
            </div>
          </div>
        </div>

        {/* UBI Preview */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="text-[10px] font-mono uppercase tracking-[0.15em] text-slate-500 mb-2">
            Citizen Dividend
          </div>
          <div className="text-lg font-serif text-slate-200 mb-1">Weekly UBI</div>
          <p className="text-[11px] text-slate-500 mb-3">
            For verified citizens with {'>'}0.85 integrity.
          </p>
          <div className="text-[10px] text-slate-500 border border-slate-700 rounded px-2 py-1.5 text-center">
            Preview only — distribution via DAEDALUS
          </div>
        </div>
      </div>

      {/* ── Recent On-Chain Transactions ── */}
      {recentTxs.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-800 flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-slate-500">
              Recent On-Chain Activity
            </span>
            <span className="text-[10px] text-slate-600">
              {chainStats.totalTransactions} total
            </span>
          </div>
          <div className="divide-y divide-slate-800/60">
            {recentTxs.map((tx, i) => {
              const src = sourceLabel(tx.source);
              return (
                <div key={`${tx.blockHash}-${i}`} className="px-4 py-2.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs">{src.icon}</span>
                    <span className="text-xs text-slate-300 truncate">{src.label}</span>
                    <span className="text-[10px] font-mono text-slate-600">#{tx.blockIndex}</span>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className={`text-xs font-mono font-semibold ${tx.amount > 0 ? 'text-emerald-400' : tx.amount < 0 ? 'text-red-400' : 'text-slate-500'}`}>
                      {tx.amount > 0 ? '+' : ''}{tx.amount.toLocaleString()} MIC
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
