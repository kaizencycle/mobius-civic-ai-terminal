'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { currentCycleId } from '@/lib/eve/cycle-engine';

type ReserveBlockSummary = {
  block_size: number;
  sealed_blocks: number;
  audit_blocks: number;
  completed_blocks_v1: number;
  in_progress_block: number;
  in_progress_balance: number;
  in_progress_pct: number;
  remaining_to_next_block: number;
  label: string;
  canon: string;
};

type VaultPayload = {
  ok?: boolean;
  vault_id?: string;
  balance_reserve?: number;
  in_progress_balance?: number;
  sealed_reserve_total?: number;
  current_tranche_balance?: number;
  carry_forward_in_tranche?: number;
  seals_count?: number;
  seals_audit_count?: number;
  activation_threshold?: number;
  gi_threshold?: number;
  sustain_cycles_required?: number;
  status?: string;
  preview_active?: boolean;
  source_entries?: number;
  last_deposit?: string | null;
  gi_current?: number | null;
  gi_threshold_met?: boolean;
  reserve_threshold_met?: boolean;
  sustain_cycles_met?: boolean;
  fountain_status?: string;
  reserve_lane?: string;
  reserve_block_lane?: string;
  vault_headline?: string;
  vault_canon?: string;
  reserve_block?: ReserveBlockSummary;
  reserve_block_label?: string;
  reserve_block_size?: number;
  reserve_blocks_completed_v1?: number;
  reserve_blocks_sealed?: number;
  reserve_blocks_audit?: number;
  reserve_block_in_progress?: number;
  reserve_block_progress_pct?: number;
  latest_seal_id?: string | null;
  latest_seal_at?: string | null;
  substrate_attestation_id?: string | null;
  substrate_event_hash?: string | null;
  substrate_attested_at?: string | null;
  substrate_attestation_error?: string | null;
  latest_block_immortalized?: boolean;
  timestamp?: string;
};

type ContributionAgentRow = {
  agent: string;
  total_reserve_contributed: number;
  deposit_count: number;
  avg_deposit_per_entry: number;
};

type ContributionsPayload = {
  ok?: boolean;
  group_by?: string;
  cycle_filter?: string | null;
  rows_scanned?: number;
  total_reserve_contributed?: number;
  agents?: ContributionAgentRow[];
  aggregates?: {
    avg_journal_score?: number | null;
    avg_gi_weight_factor?: number | null;
    avg_novelty_factor?: number | null;
    avg_duplication_decay?: number | null;
    deposits_after_first_signature_repeat?: number;
    duplication_note?: string;
  };
};

type BlockRow = {
  id: number;
  amount: number;
  status: 'attested' | 'immortalized' | 'quarantined timeout' | 'legacy v1 parcel' | 'in progress';
};

function fallbackReserveBlock(data: VaultPayload): ReserveBlockSummary {
  const blockSize = data.reserve_block_size ?? data.activation_threshold ?? 50;
  const v1Balance = data.balance_reserve ?? 0;
  const inProgress = data.in_progress_balance ?? data.current_tranche_balance ?? 0;
  const sealedBlocks = data.reserve_blocks_sealed ?? data.seals_count ?? 0;
  const auditBlocks = data.reserve_blocks_audit ?? data.seals_audit_count ?? 0;
  const completedV1 = data.reserve_blocks_completed_v1 ?? Math.floor(v1Balance / blockSize);
  const inProgressBlock = data.reserve_block_in_progress ?? Math.max(sealedBlocks, auditBlocks, completedV1) + 1;
  const pct = data.reserve_block_progress_pct ?? Math.min(100, Math.round((inProgress / blockSize) * 100));
  return {
    block_size: blockSize,
    sealed_blocks: sealedBlocks,
    audit_blocks: auditBlocks,
    completed_blocks_v1: completedV1,
    in_progress_block: inProgressBlock,
    in_progress_balance: inProgress,
    in_progress_pct: pct,
    remaining_to_next_block: Math.max(0, blockSize - inProgress),
    label: data.reserve_block_label ?? `Block ${inProgressBlock} in progress — ${inProgress.toFixed(2)} / ${blockSize.toFixed(0)} MIC (${pct}%)`,
    canon: data.vault_canon ?? 'One Reserve Block equals one 50-unit reserve parcel.',
  };
}

function buildBlockRows(block: ReserveBlockSummary, latestImmortalized: boolean): BlockRow[] {
  const maxCompleted = Math.max(block.audit_blocks, block.completed_blocks_v1, block.sealed_blocks);
  const rows: BlockRow[] = [];
  for (let i = 1; i <= maxCompleted; i += 1) {
    const attested = i <= block.sealed_blocks;
    const audited = i <= block.audit_blocks;
    const isLatestAttested = attested && i === block.sealed_blocks;
    rows.push({
      id: i,
      amount: block.block_size,
      status: isLatestAttested && latestImmortalized
        ? 'immortalized'
        : attested
          ? 'attested'
          : audited
            ? 'quarantined timeout'
            : 'legacy v1 parcel',
    });
  }
  rows.push({ id: block.in_progress_block, amount: block.in_progress_balance, status: 'in progress' });
  return rows;
}

function blockStatusClass(status: BlockRow['status']): string {
  switch (status) {
    case 'immortalized':
      return 'text-cyan-300';
    case 'attested':
      return 'text-emerald-300';
    case 'quarantined timeout':
      return 'text-rose-300';
    case 'in progress':
      return 'text-cyan-300';
    default:
      return 'text-slate-400';
  }
}

export default function VaultPage() {
  const [data, setData] = useState<VaultPayload | null>(null);
  const [contrib, setContrib] = useState<ContributionsPayload | null>(null);
  const [contribErr, setContribErr] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const focusCycle = currentCycleId();

  useEffect(() => {
    void fetch('/api/vault/status', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j: VaultPayload) => setData(j))
      .catch(() => setErr('Unable to load vault status'));
  }, []);

  useEffect(() => {
    const q = new URLSearchParams({ group_by: 'agent', cycle: focusCycle, limit: '200' });
    void fetch(`/api/vault/contributions?${q.toString()}`, { cache: 'no-store' })
      .then(async (r) => {
        const j = (await r.json()) as ContributionsPayload & { error?: string };
        if (!r.ok) {
          setContribErr(j.error ?? `HTTP ${r.status}`);
          setContrib(null);
          return;
        }
        setContribErr(null);
        setContrib(j);
      })
      .catch(() => {
        setContribErr('Unable to load contributions');
        setContrib(null);
      });
  }, [focusCycle]);

  if (err) return <div className="p-4 text-sm text-rose-300">{err}</div>;
  if (!data?.ok) return <div className="p-4 text-sm text-slate-400">Loading vault…</div>;

  const v1Bal = data.balance_reserve ?? 0;
  const block = data.reserve_block ?? fallbackReserveBlock(data);
  const cap = block.block_size;
  const inProg = block.in_progress_balance;
  const sealedTotal = data.sealed_reserve_total ?? 0;
  const blockPct = block.in_progress_pct;
  const blockFilled = Math.round(blockPct / 10);
  const blockBar = '▓'.repeat(blockFilled) + '░'.repeat(Math.max(0, 10 - blockFilled));
  const giCur = data.gi_current;
  const v1Status = (data.status ?? 'sealed').toUpperCase();
  const fountain = (data.fountain_status ?? 'locked').toUpperCase();
  const headline = data.vault_headline ?? block.label;
  const blockRows = buildBlockRows(block, Boolean(data.latest_block_immortalized));
  const quarantinedBlocks = Math.max(0, block.audit_blocks - block.sealed_blocks);
  const legacyOnlyBlocks = Math.max(0, block.completed_blocks_v1 - block.audit_blocks);

  return (
    <div className="h-full overflow-y-auto p-4 text-slate-200">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-sm font-semibold uppercase tracking-[0.15em] text-violet-200">Vault · Reserve Blocks</h1>
        <div className="flex gap-2 text-[10px] font-mono">
          <Link href="/terminal/canon" className="text-slate-500 hover:text-cyan-300">Canon →</Link>
          <Link href="/terminal/sentinel" className="text-slate-500 hover:text-cyan-300">← Sentinel</Link>
        </div>
      </div>

      <div className="mb-3 rounded border border-emerald-500/25 bg-slate-950/90 p-3 font-mono text-[11px] text-emerald-100/95">
        <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-400/90">Reserve Block seal</div>
        <p className="mt-1 leading-relaxed text-emerald-50/90">{headline}</p>
        <p className="mt-1 text-[10px] italic text-slate-500">{block.canon}</p>
      </div>

      <div className="rounded border border-violet-500/30 bg-slate-950/80 p-4 font-mono text-xs">
        <div className="text-[11px] uppercase tracking-[0.2em] text-violet-300/90">Fountain / v1 gate · {v1Status}</div>
        <div className="mt-2 text-[10px] text-slate-400">v1 cumulative (compat): {v1Bal.toFixed(2)} units · legacy parcels: {block.completed_blocks_v1}</div>
        <div className="mt-3 space-y-1 text-slate-400">
          <div>Sealed reserve total: <span className="text-violet-200">{sealedTotal.toFixed(2)}</span></div>
          <div>Sealed & attested: <span className="text-emerald-300">{block.sealed_blocks}</span> blocks</div>
          <div>Quarantined / timeout: <span className="text-rose-300">{quarantinedBlocks}</span> blocks · needs re-attestation</div>
          <div>Legacy v1 parcels: <span className="text-slate-300">{block.completed_blocks_v1}</span>{legacyOnlyBlocks > 0 ? <span className="text-slate-500"> · {legacyOnlyBlocks} not represented in audit seals yet</span> : null}</div>
          <div>Current Block: <span className="text-violet-200">{blockBar} {inProg.toFixed(2)} / {cap.toFixed(2)} MIC</span></div>
          <div>Block status: <span className="text-cyan-200">{block.label}</span></div>
          <div>Fountain: <span className="text-amber-200/90">{fountain}</span>{data.reserve_block_lane ? <span className="text-slate-500"> · reserve_block_lane: {data.reserve_block_lane}</span> : null}</div>
          <div>GI threshold: {data.gi_threshold ?? 0.95} · Current: {giCur != null && Number.isFinite(giCur) ? giCur.toFixed(2) : '—'}{data.gi_threshold_met ? ' · GI gate met' : ''}</div>
          <div>Sustain cycles required: {data.sustain_cycles_required ?? 5}{data.sustain_cycles_met ? ' · sustain met' : ' · sustain: not tracked in KV yet'}</div>
          <div>preview_active: {data.preview_active ? 'true' : 'false'} (GI preview band)</div>
          <div>source_entries: {data.source_entries ?? 0}</div>
          <div>last_deposit: {data.last_deposit ?? 'null'}</div>
          {(data.latest_seal_id || data.latest_seal_at) && <div className="pt-1 text-slate-500">Latest seal: {data.latest_seal_id ?? '—'} @ {data.latest_seal_at ?? '—'}</div>}
          {(data.substrate_attestation_id || data.substrate_attestation_error) && (
            <div className={data.substrate_attestation_id ? 'text-cyan-300' : 'text-rose-300'}>
              Substrate: {data.substrate_attestation_id ?? data.substrate_attestation_error}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 rounded border border-violet-500/25 bg-slate-950/70 p-4 font-mono text-xs">
        <div className="mb-2 text-[11px] uppercase tracking-[0.2em] text-violet-300/80">Reserve Block history</div>
        <div className="space-y-1.5">
          {blockRows.map((row) => (
            <div key={`${row.id}-${row.status}`} className="flex items-center justify-between border-b border-slate-800/70 py-1 last:border-0">
              <span className="text-slate-300">Block {row.id}</span>
              <span className="text-slate-400">{row.amount.toFixed(2)} MIC</span>
              <span className={blockStatusClass(row.status)}>{row.status}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded border border-slate-700/50 bg-slate-950/60 p-4 font-mono text-xs">
        <div className="mb-2 text-[11px] uppercase tracking-[0.2em] text-violet-300/80">Path to Fountain (integrity)</div>
        {(() => {
          const giThresh = data.gi_threshold ?? 0.95;
          const giGap = giCur != null ? Math.max(0, giThresh - giCur) : giThresh;
          const sustain = data.sustain_cycles_required ?? 5;
          const reserveGap = block.remaining_to_next_block;
          const giReady = data.gi_threshold_met ?? (giCur != null && giCur >= giThresh);
          const reserveReady = data.reserve_threshold_met ?? inProg >= cap;

          return (
            <div className="space-y-2.5">
              <div>
                <div className="mb-1 flex items-center justify-between text-[10px]"><span className="text-slate-400">GI ≥ {giThresh.toFixed(2)} (Fountain)</span><span className={giReady ? 'text-emerald-400' : 'text-amber-400'}>{giReady ? 'MET' : `gap: ${giGap.toFixed(2)}`}</span></div>
                <div className="h-1.5 overflow-hidden rounded bg-slate-800"><div className="h-full rounded transition-all duration-500" style={{ width: `${giCur != null ? Math.min(100, (giCur / giThresh) * 100) : 0}%`, background: giReady ? '#10b981' : '#f59e0b' }} /></div>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between text-[10px]"><span className="text-slate-400">Next Reserve Block ≥ {cap.toFixed(0)} MIC</span><span className={reserveReady ? 'text-emerald-400' : 'text-amber-400'}>{reserveReady ? 'MET' : `need: ${reserveGap.toFixed(2)} more`}</span></div>
                <div className="h-1.5 overflow-hidden rounded bg-slate-800"><div className="h-full rounded transition-all duration-500" style={{ width: `${blockPct}%`, background: reserveReady ? '#10b981' : '#a78bfa' }} /></div>
              </div>
              <div className="flex items-center justify-between text-[10px]"><span className="text-slate-400">Sustain GI ≥ {giThresh} for {sustain} cycles</span><span className="text-slate-500">tracking (when wired)</span></div>
              <p className="mt-1 text-[9px] leading-relaxed text-slate-600">A <strong className="text-slate-500">Reserve Block</strong> can seal at 50 MIC without Fountain unlock. Fountain unlock still requires GI sustain and the v1 activating path — do not conflate &quot;Block sealed&quot; with &quot;Vault unsealed&quot; for payouts.</p>
            </div>
          );
        })()}
      </div>

      <div className="mt-4 rounded border border-cyan-900/40 bg-slate-950/70 p-4 font-mono text-xs">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px] uppercase tracking-[0.18em] text-cyan-300/85"><span>Contributions · {focusCycle}</span><span className="text-[10px] font-normal normal-case tracking-normal text-slate-500">GET /api/vault/contributions?group_by=agent&amp;cycle={focusCycle}</span></div>
        {contribErr ? <p className="text-[11px] text-amber-200/90">{contribErr}</p> : !contrib?.ok ? <p className="text-slate-500">Loading contributions…</p> : (
          <>
            <div className="mb-3 grid gap-2 text-[10px] text-slate-400 sm:grid-cols-2"><div>Reserve in window: <span className="text-cyan-100">{(contrib.total_reserve_contributed ?? 0).toFixed(4)}</span> · rows {contrib.rows_scanned ?? 0}</div>{contrib.aggregates ? <div className="space-y-0.5"><div>Avg journal_score: {contrib.aggregates.avg_journal_score != null ? contrib.aggregates.avg_journal_score.toFixed(3) : '—'} · Avg Wg (dep/J): {contrib.aggregates.avg_gi_weight_factor != null ? contrib.aggregates.avg_gi_weight_factor.toFixed(3) : '—'}</div><div>Replay N / D: {contrib.aggregates.avg_novelty_factor != null ? contrib.aggregates.avg_novelty_factor.toFixed(3) : '—'} / {contrib.aggregates.avg_duplication_decay != null ? contrib.aggregates.avg_duplication_decay.toFixed(3) : '—'}</div></div> : null}</div>
            {contrib.aggregates?.duplication_note ? <p className="mb-3 text-[10px] leading-relaxed text-slate-500">{contrib.aggregates.duplication_note}</p> : null}
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Top agents (this cycle)</div>
            <ul className="mt-1 space-y-1.5">{(contrib.agents ?? []).slice(0, 8).map((a) => <li key={a.agent} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-800/80 py-1 last:border-0"><span className="text-slate-300">{a.agent}</span><span className="text-right text-slate-400"><span className="text-cyan-100">{a.total_reserve_contributed.toFixed(4)}</span><span className="text-slate-600"> · </span>{a.deposit_count} dep<span className="text-slate-600"> · avg </span>{a.avg_deposit_per_entry.toFixed(4)}</span></li>)}</ul>
            {(contrib.agents ?? []).length === 0 ? <p className="mt-2 text-[10px] text-slate-600">No deposits parsed for this cycle in the current window.</p> : null}
          </>
        )}
      </div>
    </div>
  );
}
