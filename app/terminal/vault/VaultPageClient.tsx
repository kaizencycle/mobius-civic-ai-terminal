'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AttestationStatus } from '@/components/vault/AttestationStatus';
import { GIPerceptionFountainPanel } from '@/components/integrity/GIPerceptionFountainPanel';
import { currentCycleId } from '@/lib/eve/cycle-engine';
import { collisionAffectedSets } from '@/lib/vault/collision-affected-blocks';
import type { CollisionAffectedBlockSnapshot } from '@/lib/vault/collision-affected-blocks';
import {
  blockRowLabel,
  blockStatusClass,
  buildReserveBlockRows,
  type BlockRow,
} from '@/lib/vault/reserve-block-rows';

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
  identity_service_configured?: boolean;
  identity_login_ok?: boolean;
  identity_introspect_ok?: boolean;
  identity_attest_diagnosis?: string;
  latest_block_immortalized?: boolean;
  timestamp?: string;
  substrate_attestation_coverage?: {
    examined?: number;
    immortalized?: number;
    errored?: number;
    unattested?: number;
  };
  reserve_block_truth?: {
    vault_index_records: number;
    vault_audit_index_records: number;
    attested_records_examined: number;
    collision_pair_count: number | null;
    collision_affected_blocks: CollisionAffectedBlockSnapshot | null;
    canonical_reserve_blocks: number | null;
    canonical_count_status: string;
    historical_era_breakdown: {
      pre_canon_records: { count: number | null; status: string; note?: string };
      legacy_tranche_records: { count: number | null; status: string; note?: string };
      modern_reserve_block_records: { count: number | null; status: string; note?: string };
      alternate_or_collision_records: { count: number | null; status: string; note?: string };
    };
    integrity_gate: {
      enabled: boolean;
      active: boolean;
      hard_stop_enabled: boolean;
      sealing_suspended: boolean;
      reasons: string[];
    };
    deposits_active: boolean;
    deposit_activity_status?: string;
    accumulator: {
      operational_slot_projected: number;
      in_progress_balance: number;
      block_size: number;
      in_progress_pct: number;
      remaining_to_next_block: number;
      projection_note: string;
      candidate_formation_blocked: boolean;
    };
    formation_status: string;
    latest_canonical_seal_id: string | null;
    headline: string;
    operator_summary: string;
    vault_seal_index_count?: number;
    attested_seals_examined?: number;
  };
  seal_integrity_gate?: {
    enabled: boolean;
    active: boolean;
    hard_stop_enabled: boolean;
    sealing_suspended: boolean;
    reasons: string[];
  };
  operator_summary?: string;
  collision_pair_count?: number | null;
  canonical_reserve_blocks?: number | null;
  canonical_count_status?: string;
  formation_status?: string;
  deposit_activity_status?: string;
  seals_quarantined_count?: number;
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

function eraStatusLabel(status: string): string {
  switch (status) {
    case 'verified_historical_era':
      return 'Verified historical era';
    case 'reconciliation_pending':
      return 'Reconciliation pending';
    case 'unverified':
      return 'Unverified';
    case 'verified':
      return 'Verified';
    default:
      return status.replace(/_/g, ' ');
  }
}

function eraCountLabel(count: number | null | undefined): string {
  if (count == null) return '—';
  return String(count);
}

function ReserveBlockTruthPanel({
  truth,
  sealedBlocks,
  attestedExamined,
}: {
  truth: NonNullable<VaultPayload['reserve_block_truth']>;
  sealedBlocks: number;
  attestedExamined: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const gate = truth.integrity_gate;
  const eras = truth.historical_era_breakdown;
  const vaultRecords = truth.vault_index_records ?? truth.vault_seal_index_count ?? sealedBlocks;
  const attested = truth.attested_records_examined ?? truth.attested_seals_examined ?? attestedExamined;
  const integrityHold = gate.active;

  return (
    <div className={`mt-4 rounded border font-mono text-xs ${integrityHold ? 'border-rose-500/35 bg-rose-500/5' : 'border-violet-500/30 bg-violet-500/5'}`}>
      <button
        type="button"
        className="flex w-full items-center justify-between px-3 py-2 text-left"
        onClick={() => setExpanded((prev) => !prev)}
      >
        <div className="flex items-center gap-2">
          <span className={`text-[10px] uppercase tracking-[0.18em] ${integrityHold ? 'text-rose-300' : 'text-violet-300'}`}>Reserve Block truth</span>
          <span className={`rounded border px-1.5 py-0.5 text-[9px] ${integrityHold ? 'border-rose-500/40 bg-rose-500/10 text-rose-200' : 'border-violet-500/40 bg-violet-500/10 text-violet-200'}`}>
            {truth.formation_status.replace(/_/g, ' ').toUpperCase()}
          </span>
        </div>
        <span className="text-slate-400">{expanded ? '−' : '+'}</span>
      </button>
      {expanded && (
        <div className={`border-t px-3 py-2 text-slate-400 space-y-2 ${integrityHold ? 'border-rose-500/20' : 'border-violet-500/20'}`}>
          <p className="text-[10px] text-slate-200/90">{truth.operator_summary}</p>
          {truth.deposit_activity_status && truth.deposit_activity_status !== 'active' ? (
            <p className="text-[10px] text-amber-300">Deposit activity: {truth.deposit_activity_status.replace(/_/g, ' ').toUpperCase()}</p>
          ) : null}
          <div className="grid gap-1 text-[10px] sm:grid-cols-2">
            <div>Vault records indexed: <span className="text-violet-200">{vaultRecords}</span></div>
            <div>Attested records examined: <span className="text-emerald-300">{attested}</span></div>
            <div>Collision pairs detected: <span className="text-amber-300">{truth.collision_pair_count ?? '—'}</span></div>
            <div>Contested block slots: <span className="text-amber-300">{truth.collision_affected_blocks?.affected_block_numbers.length ?? '—'}</span></div>
            <div>Canonical Reserve Blocks: <span className="text-amber-300">{truth.canonical_reserve_blocks ?? 'Reconciliation pending'}</span></div>
            <div>Latest canonical seal: <span className="text-slate-300">{truth.latest_canonical_seal_id ?? 'Unresolved'}</span></div>
            <div>Current accumulation: <span className="text-cyan-200">{truth.accumulator.in_progress_balance.toFixed(2)} / {truth.accumulator.block_size} MIC</span></div>
            <div>Projected slot: <span className="text-cyan-200">{truth.accumulator.operational_slot_projected}</span> <span className="text-slate-500">(operational)</span></div>
            <div>Integrity gate: <span className={gate.active ? 'text-rose-300' : 'text-slate-300'}>{gate.active ? 'ENGAGED' : 'OFF'}</span></div>
          </div>
          <div className="pt-1 text-[10px] uppercase tracking-wide text-slate-500">Historical record classes</div>
          <div className="grid gap-1 text-[10px] sm:grid-cols-2">
            <div>Pre-canon parcels: <span className="text-slate-300">{eraCountLabel(eras.pre_canon_records.count)}</span> · <span className="text-slate-400">{eraStatusLabel(eras.pre_canon_records.status)}</span></div>
            <div>Legacy MIC tranches: <span className="text-slate-300">{eraCountLabel(eras.legacy_tranche_records.count)}</span> · <span className="text-slate-400">{eraStatusLabel(eras.legacy_tranche_records.status)}</span></div>
            <div>Modern Reserve Block records: <span className="text-slate-300">{eraCountLabel(eras.modern_reserve_block_records.count)}</span> · <span className="text-slate-400">{eraStatusLabel(eras.modern_reserve_block_records.status)}</span></div>
            <div>Alternate / collision records: <span className="text-slate-300">{eraCountLabel(eras.alternate_or_collision_records.count)}</span> · <span className="text-slate-400">{eraStatusLabel(eras.alternate_or_collision_records.status)}</span></div>
          </div>
          <p className="text-[9px] italic text-slate-500">{truth.accumulator.projection_note}</p>
          {gate.reasons.length > 0 ? (
            <div className="text-[9px] text-slate-500">Gate reason: {gate.reasons[0]}</div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function QuarantinePanel({ quarantinedCount, sealedBlocks }: { quarantinedCount: number; sealedBlocks: number }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="mt-4 rounded border border-amber-500/30 bg-amber-500/5 font-mono text-xs">
      <button
        type="button"
        className="flex w-full items-center justify-between px-3 py-2 text-left"
        onClick={() => setExpanded((prev) => !prev)}
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.18em] text-amber-300">⚑ Quarantined Seals</span>
          <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[9px] text-amber-200">
            {quarantinedCount}
          </span>
        </div>
        <span className="text-slate-400">{expanded ? '−' : '+'}</span>
      </button>
      {expanded && (
        <div className="border-t border-amber-500/20 px-3 py-2 text-slate-400 space-y-1">
          <p className="text-[10px]">
            These seals carry quarantined status in KV (distinct from hash-divergent block_number collision pairs).
            Inspect Canon for timeout/reject cause; reattest cron may advance when dependencies recover.
          </p>
          <div className="mt-2 text-[10px] text-slate-500">
            Seal index (attested): <span className="text-emerald-300">{sealedBlocks}</span> · Quarantined seals: <span className="text-amber-300">{quarantinedCount}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function VaultPageClient() {
  const [data, setData] = useState<VaultPayload | null>(null);
  const [contrib, setContrib] = useState<ContributionsPayload | null>(null);
  const [contribErr, setContribErr] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const focusCycle = currentCycleId();

  useEffect(() => {
    // OPT-4 (C-321): 10s AbortController guard — substrate 404/502 can hold the
    // lambda open up to 30s, leaving the chamber stuck on "Loading vault…".
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    void fetch('/api/vault/status', { cache: 'no-store', signal: controller.signal })
      .then(async (r) => {
        clearTimeout(timeout);
        const j = (await r.json()) as VaultPayload & { error?: string };
        if (!r.ok || !j.ok) {
          setErr(j.error ?? `Vault status unavailable (HTTP ${r.status})`);
          setData(j);
          return;
        }
        setData(j);
      })
      .catch((e: unknown) => {
        clearTimeout(timeout);
        if (e instanceof DOMException && e.name === 'AbortError') {
          setErr('Vault status timed out — substrate may be unreachable. Set SUBSTRATE_TOKEN, TERMINAL_ID, TERMINAL_API_BASE in Vercel env vars to restore vault writes.');
        } else {
          setErr('Unable to load vault status');
        }
      })
      .finally(() => setLoading(false));

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
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

  if (loading) return (
    <div className="p-4 font-mono text-xs text-amber-400 animate-pulse">VAULT · probing substrate…</div>
  );
  if (err) {
    // OPT-04: DEGRADED state with circuit-breaker info instead of bare error text
    const is404 = err.includes('404') || err.includes('attest') || err.includes('timeout') || err.includes('Vault status timed out');
    return (
      <div className="p-4 space-y-3 font-mono text-xs">
        <div className="flex items-center gap-2 px-3 py-2 bg-red-950/30 border border-red-800/50 rounded text-red-300">
          <span className="animate-pulse">⚠</span>
          <span>VAULT DEGRADED · {is404 ? 'substrate path unreachable' : 'endpoint unavailable'}</span>
          <span className="ml-auto text-zinc-600">{new Date().toISOString().slice(11, 19)} UTC</span>
        </div>
        <div className="text-rose-300 text-[10px] leading-relaxed">{err}</div>
        <div className="rounded border border-zinc-800 px-3 py-2 text-zinc-500 text-[10px] space-y-1">
          <div>Circuit breaker open · vault reads suspended until substrate responds.</div>
          <div>▸ Verify SUBSTRATE_TOKEN, TERMINAL_ID, TERMINAL_API_BASE in Vercel env vars.</div>
          <div>▸ Cycle quorum: POST /api/vault/attest ({`{agent,cycle,confidence,source}`}). Seal votes: POST /api/vault/seal/attest.</div>
        </div>
      </div>
    );
  }
  if (!data?.ok) return <div className="p-4 text-sm text-amber-300">Vault status endpoint returned no usable payload. Check /api/vault/status and upstream vault lane health.</div>;

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
  const headline = data.vault_headline ?? data.reserve_block_truth?.headline ?? block.label;
  const operatorSummary = data.operator_summary ?? data.reserve_block_truth?.operator_summary;
  const truth = data.reserve_block_truth;
  const integrityHold = Boolean(truth?.integrity_gate.active ?? data.seal_integrity_gate?.active);
  const attestedExamined = truth?.attested_records_examined ?? truth?.attested_seals_examined ?? data.substrate_attestation_coverage?.examined ?? block.sealed_blocks;
  const collisionSnapshot = truth?.collision_affected_blocks ?? null;
  const collisionSets = collisionAffectedSets(collisionSnapshot);
  const blockRows = buildReserveBlockRows({
    block,
    latestImmortalized: Boolean(data.latest_block_immortalized),
    integrityHold,
    collisionAffected: collisionSets?.affected,
    threeWayBlocks: collisionSets?.threeWay,
  });
  const auditOnlyBlocks = Math.max(0, block.audit_blocks - block.sealed_blocks);
  const quarantinedCount = data.seals_quarantined_count ?? 0;
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

      <div className={`mb-3 rounded border p-3 font-mono text-[11px] ${integrityHold ? 'border-rose-500/35 bg-slate-950/90 text-rose-50/95' : 'border-emerald-500/25 bg-slate-950/90 text-emerald-100/95'}`}>
        <div className={`text-[10px] uppercase tracking-[0.18em] ${integrityHold ? 'text-rose-400/90' : 'text-emerald-400/90'}`}>
          {integrityHold ? 'Reserve Block · integrity hold' : 'Reserve Block seal'}
        </div>
        <p className="mt-1 leading-relaxed">{headline}</p>
        {operatorSummary ? <p className="mt-1 text-[10px] text-slate-400">{operatorSummary}</p> : null}
        <p className="mt-1 text-[10px] italic text-slate-500">{block.canon}</p>
      </div>

      <div className="rounded border border-violet-500/30 bg-slate-950/80 p-4 font-mono text-xs">
        <div className="text-[11px] uppercase tracking-[0.2em] text-violet-300/90">
          Fountain / v1 gate · {v1Status}
          {integrityHold ? <span className="ml-2 text-rose-300/90">· SEALING SUSPENDED</span> : null}
        </div>
        <div className="mt-2 text-[10px] text-slate-400">v1 cumulative (compat): {v1Bal.toFixed(2)} units · legacy parcels: {block.completed_blocks_v1}</div>
        <div className="mt-3 space-y-1 text-slate-400">
          <div>Sealed reserve total: <span className="text-violet-200">{sealedTotal.toFixed(2)}</span></div>
          <div>Vault records indexed: <span className="text-violet-200">{truth?.vault_index_records ?? truth?.vault_seal_index_count ?? block.sealed_blocks}</span></div>
          <div>Attested records examined: <span className="text-emerald-300">{attestedExamined}</span></div>
          <div>Canonical Reserve Blocks: <span className="text-amber-300">{data.canonical_reserve_blocks ?? truth?.canonical_reserve_blocks ?? 'Reconciliation pending'}</span></div>
          <div>Collision pairs: <span className="text-amber-300">{data.collision_pair_count ?? truth?.collision_pair_count ?? '—'}</span></div>
          <div>Quarantined seals (KV status): <span className="text-amber-300">{quarantinedCount}</span>{auditOnlyBlocks > 0 ? <span className="text-slate-500"> · audit-only delta: {auditOnlyBlocks}</span> : null}</div>
          <div>Legacy v1 parcels: <span className="text-slate-300">{block.completed_blocks_v1}</span>{legacyOnlyBlocks > 0 ? <span className="text-slate-500"> · {legacyOnlyBlocks} not represented in audit seals yet</span> : null}</div>
          <div>Current Block: <span className="text-violet-200">{blockBar} {inProg.toFixed(2)} / {cap.toFixed(2)} MIC</span></div>
          <div>Block status: <span className="text-cyan-200">{block.label}</span>{integrityHold ? <span className="text-rose-300/90"> · projected slot #{truth?.accumulator.operational_slot_projected ?? block.in_progress_block} (operational)</span> : null}</div>
          <div>Fountain: <span className="text-amber-200/90">{fountain}</span>{data.reserve_block_lane ? <span className="text-slate-500"> · reserve_block_lane: {data.reserve_block_lane}</span> : null}{data.formation_status ? <span className="text-slate-500"> · formation: {data.formation_status}</span> : null}</div>
          {integrityHold ? (
            <div>Integrity gate: <span className="text-rose-300">ENGAGED</span>{data.seal_integrity_gate?.reasons?.[0] ? <span className="text-slate-500"> · {data.seal_integrity_gate.reasons[0]}</span> : null}</div>
          ) : null}
          <div>GI threshold: {data.gi_threshold ?? 0.95} · Current: {giCur != null && Number.isFinite(giCur) ? giCur.toFixed(2) : '—'}{data.gi_threshold_met ? ' · GI gate met' : ''}</div>
          {/* OPT-17: visual sustain progress bar — 0/5 with fill */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span>Sustain gate:</span>
              <span className={data.sustain_cycles_met ? 'text-emerald-300' : 'text-amber-400'}>
                {data.sustain_cycles_met
                  ? `${data.sustain_cycles_required ?? 5} / ${data.sustain_cycles_required ?? 5} met`
                  : `? / ${data.sustain_cycles_required ?? 5} consecutive`}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded bg-slate-800">
              <div
                className="h-full rounded transition-all duration-500"
                style={{
                  width: data.sustain_cycles_met ? '100%' : '0%',
                  background: data.sustain_cycles_met ? '#10b981' : '#ef4444',
                }}
              />
            </div>
            {!data.sustain_cycles_met && (
              <div className="text-[9px] text-slate-600">
                {data.substrate_attestation_error
                  ? data.identity_service_configured === false
                    ? 'IDENTITY_SERVICE_EMAIL/PASSWORD missing on Vercel — live attest blocked'
                    : data.identity_login_ok === false
                      ? 'Identity login failed — service account missing or password wrong (Render DB may be wiped)'
                      : 'Vault write path error blocking attestation progress'
                  : 'Awaiting consecutive attestation cycles'}
              </div>
            )}
          </div>
          <div>preview_active: {data.preview_active ? 'true' : 'false'} (GI preview band)</div>
          <div>source_entries: {data.source_entries ?? 0}</div>
          <div>last_deposit: {data.last_deposit ?? 'null'}</div>
          {(data.latest_seal_id || data.latest_seal_at) && <div className="pt-1 text-slate-500">Latest seal: {data.latest_seal_id ?? '—'} @ {data.latest_seal_at ?? '—'}</div>}
          <AttestationStatus
            erroredBlocks={data.substrate_attestation_coverage?.errored ?? 0}
            sealedBlocks={block.sealed_blocks}
            liveAttested={data.substrate_attestation_coverage?.immortalized ?? 0}
            identityServiceConfigured={data.identity_service_configured !== false}
            identityLoginOk={data.identity_login_ok}
            identityAttestDiagnosis={data.identity_attest_diagnosis}
            substrateAttestationError={data.substrate_attestation_error}
            substrateAttestationId={data.substrate_attestation_id}
          />
        </div>
      </div>

      <div className="mt-4 rounded border border-violet-500/25 bg-slate-950/70 p-4 font-mono text-xs">
        <div className="mb-2 text-[11px] uppercase tracking-[0.2em] text-violet-300/80">Reserve Block history</div>
        {integrityHold ? (
          <div className="mb-2 rounded border border-rose-500/25 bg-rose-500/5 px-2 py-1.5 text-[10px] text-rose-200/90">
            Integrity hold — historical slots are <span className="text-violet-200">indexed</span> (KV record, canon pending).
            {collisionSets ? (
              <>
                {' '}<span className="text-amber-200">{collisionSnapshot?.affected_block_numbers.length ?? 0} contested</span>
                {collisionSnapshot?.three_way_blocks.length ? (
                  <span className="text-orange-200"> · blocks {collisionSnapshot.three_way_blocks.join(', ')} three-way</span>
                ) : null}
                {' '}per collision audit.
              </>
            ) : (
              <span className="text-slate-400"> Per-slot precision pending collision audit artifact on KV.</span>
            )}
          </div>
        ) : null}
        <div className="space-y-1.5">
          {blockRows.map((row) => (
            <div key={`${row.id}-${row.status}`} className="flex items-center justify-between border-b border-slate-800/70 py-1 last:border-0">
              <span className="text-slate-300">{blockRowLabel(row)}</span>
              <span className="text-slate-400">{row.amount.toFixed(2)} MIC</span>
              <span className={blockStatusClass(row.status)}>{row.status}</span>
            </div>
          ))}
        </div>
      </div>

      {truth ? (
        <ReserveBlockTruthPanel truth={truth} sealedBlocks={block.sealed_blocks} attestedExamined={attestedExamined} />
      ) : null}

      {quarantinedCount > 0 ? (
        <QuarantinePanel quarantinedCount={quarantinedCount} sealedBlocks={block.sealed_blocks} />
      ) : null}

      <GIPerceptionFountainPanel vaultFountainLane={data.fountain_status ?? data.reserve_block_lane} />

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
                <div className="mb-1 flex items-center justify-between text-[10px]"><span className="text-slate-400">Next Reserve Block ≥ {cap.toFixed(0)} MIC</span><span className={integrityHold ? 'text-rose-400' : reserveReady ? 'text-emerald-400' : 'text-amber-400'}>{integrityHold ? 'SEALING SUSPENDED' : reserveReady ? 'MET' : `need: ${reserveGap.toFixed(2)} more`}</span></div>
                <div className="h-1.5 overflow-hidden rounded bg-slate-800"><div className="h-full rounded transition-all duration-500" style={{ width: `${blockPct}%`, background: integrityHold ? '#f43f5e' : reserveReady ? '#10b981' : '#a78bfa' }} /></div>
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
