'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type VaultPayload = {
  ok?: boolean;
  vault_id?: string;
  balance_reserve?: number;
  in_progress_balance?: number;
  sealed_reserve_total?: number;
  current_tranche_balance?: number;
  carry_forward_in_tranche?: number;
  seals_count?: number;
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
  vault_headline?: string;
  vault_canon?: string;
  latest_seal_id?: string | null;
  latest_seal_at?: string | null;
  timestamp?: string;
};

export default function VaultPage() {
  const [data, setData] = useState<VaultPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void fetch('/api/vault/status', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j: VaultPayload) => setData(j))
      .catch(() => setErr('Unable to load vault status'));
  }, []);

  if (err) {
    return <div className="p-4 text-sm text-rose-300">{err}</div>;
  }
  if (!data?.ok) {
    return <div className="p-4 text-sm text-slate-400">Loading vault…</div>;
  }

  const v1Bal = data.balance_reserve ?? 0;
  const cap = data.activation_threshold ?? 50;
  const inProg = data.in_progress_balance ?? data.current_tranche_balance ?? 0;
  const sealedTotal = data.sealed_reserve_total ?? 0;
  const tranchePct = cap > 0 ? Math.min(100, (inProg / cap) * 100) : 0;
  const trancheFilled = Math.round(tranchePct / 10);
  const trancheBar = '▓'.repeat(trancheFilled) + '░'.repeat(Math.max(0, 10 - trancheFilled));
  const giCur = data.gi_current;
  const v1Status = (data.status ?? 'sealed').toUpperCase();
  const fountain = (data.fountain_status ?? 'locked').toUpperCase();
  const headline = data.vault_headline ?? 'Vault reserve';

  return (
    <div className="h-full overflow-y-auto p-4 text-slate-200">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-sm font-semibold uppercase tracking-[0.15em] text-violet-200">Vault · reserve</h1>
        <Link href="/terminal/sentinel" className="text-[10px] font-mono text-slate-500 hover:text-cyan-300">
          ← Sentinel
        </Link>
      </div>

      <div className="mb-3 rounded border border-emerald-500/25 bg-slate-950/90 p-3 font-mono text-[11px] text-emerald-100/95">
        <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-400/90">Reserve seal</div>
        <p className="mt-1 leading-relaxed text-emerald-50/90">{headline}</p>
        {data.vault_canon ? (
          <p className="mt-1 text-[10px] italic text-slate-500">{data.vault_canon}</p>
        ) : null}
      </div>

      <div className="rounded border border-violet-500/30 bg-slate-950/80 p-4 font-mono text-xs">
        <div className="text-[11px] uppercase tracking-[0.2em] text-violet-300/90">Fountain / v1 gate · {v1Status}</div>
        <div className="mt-2 text-[10px] text-slate-400">
          v1 cumulative (compat): {v1Bal.toFixed(2)} units — not reset when tranches seal
        </div>
        <div className="mt-3 space-y-1 text-slate-400">
          <div>
            Sealed reserve total: <span className="text-violet-200">{sealedTotal.toFixed(2)}</span> (attested
            tranches)
          </div>
          <div>
            Current tranche:{' '}
            <span className="text-violet-200">
              {trancheBar} {inProg.toFixed(2)} / {cap.toFixed(2)}
            </span>
          </div>
          <div>
            Fountain: <span className="text-amber-200/90">{fountain}</span>
            {data.reserve_lane ? <span className="text-slate-500"> · reserve_lane: {data.reserve_lane}</span> : null}
          </div>
          <div>
            GI threshold: {data.gi_threshold ?? 0.95} · Current:{' '}
            {giCur != null && Number.isFinite(giCur) ? giCur.toFixed(2) : '—'}
            {data.gi_threshold_met ? ' · GI gate met' : ''}
          </div>
          <div>
            Sustain cycles required: {data.sustain_cycles_required ?? 5}
            {data.sustain_cycles_met ? ' · sustain met' : ' · sustain: not tracked in KV yet'}
          </div>
          <div>
            preview_active: {data.preview_active ? 'true' : 'false'} (GI preview band)
          </div>
          <div>source_entries: {data.source_entries ?? 0}</div>
          <div>last_deposit: {data.last_deposit ?? 'null'}</div>
          {(data.latest_seal_id || data.latest_seal_at) && (
            <div className="pt-1 text-slate-500">
              Latest seal: {data.latest_seal_id ?? '—'} @ {data.latest_seal_at ?? '—'}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 rounded border border-slate-700/50 bg-slate-950/60 p-4 font-mono text-xs">
        <div className="mb-2 text-[11px] uppercase tracking-[0.2em] text-violet-300/80">Path to Fountain (integrity)</div>
        {(() => {
          const giThresh = data.gi_threshold ?? 0.95;
          const giGap = giCur != null ? Math.max(0, giThresh - giCur) : giThresh;
          const sustain = data.sustain_cycles_required ?? 5;
          const reserveGap = Math.max(0, cap - inProg);
          const giReady = data.gi_threshold_met ?? (giCur != null && giCur >= giThresh);
          const reserveReady = data.reserve_threshold_met ?? inProg >= cap;

          return (
            <div className="space-y-2.5">
              <div>
                <div className="mb-1 flex items-center justify-between text-[10px]">
                  <span className="text-slate-400">GI ≥ {giThresh.toFixed(2)} (Fountain)</span>
                  <span className={giReady ? 'text-emerald-400' : 'text-amber-400'}>
                    {giReady ? 'MET' : `gap: ${giGap.toFixed(2)}`}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded bg-slate-800">
                  <div
                    className="h-full rounded transition-all duration-500"
                    style={{
                      width: `${giCur != null ? Math.min(100, (giCur / giThresh) * 100) : 0}%`,
                      background: giReady ? '#10b981' : '#f59e0b',
                    }}
                  />
                </div>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between text-[10px]">
                  <span className="text-slate-400">Next tranche ≥ {cap.toFixed(0)} (in progress)</span>
                  <span className={reserveReady ? 'text-emerald-400' : 'text-amber-400'}>
                    {reserveReady ? 'MET' : `need: ${reserveGap.toFixed(2)} more`}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded bg-slate-800">
                  <div
                    className="h-full rounded transition-all duration-500"
                    style={{
                      width: `${tranchePct}%`,
                      background: reserveReady ? '#10b981' : '#a78bfa',
                    }}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-slate-400">Sustain GI ≥ {giThresh} for {sustain} cycles</span>
                  <span className="text-slate-500">tracking (when wired)</span>
                </div>
              </div>

              <p className="mt-1 text-[9px] leading-relaxed text-slate-600">
                A <strong className="text-slate-500">reserve tranche</strong> can seal at 50 units without Fountain
                unlock. Fountain unlock still requires GI sustain and the v1 activating path — do not conflate
                &quot;Seal achieved&quot; with &quot;Vault unsealed&quot; for payouts.
              </p>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
