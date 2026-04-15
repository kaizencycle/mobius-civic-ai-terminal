'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type VaultPayload = {
  ok?: boolean;
  vault_id?: string;
  balance_reserve?: number;
  activation_threshold?: number;
  gi_threshold?: number;
  sustain_cycles_required?: number;
  status?: string;
  preview_active?: boolean;
  source_entries?: number;
  last_deposit?: string | null;
  gi_current?: number | null;
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

  const bal = data.balance_reserve ?? 0;
  const cap = data.activation_threshold ?? 50;
  const pct = cap > 0 ? Math.min(100, (bal / cap) * 100) : 0;
  const filled = Math.round(pct / 10);
  const bar = '▓'.repeat(filled) + '░'.repeat(Math.max(0, 10 - filled));
  const giCur = data.gi_current;
  const status = (data.status ?? 'sealed').toUpperCase();

  return (
    <div className="h-full overflow-y-auto p-4 text-slate-200">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-sm font-semibold uppercase tracking-[0.15em] text-violet-200">Vault · reserve</h1>
        <Link href="/terminal/sentinel" className="text-[10px] font-mono text-slate-500 hover:text-cyan-300">
          ← Sentinel
        </Link>
      </div>
      <div className="rounded border border-violet-500/30 bg-slate-950/80 p-4 font-mono text-xs">
        <div className="text-[11px] uppercase tracking-[0.2em] text-violet-300/90">VAULT · {status}</div>
        <div className="mt-2 text-[10px] text-slate-400">
          {bar} {bal.toFixed(2)} / {cap.toFixed(2)} reserve units
        </div>
        <div className="mt-3 space-y-1 text-slate-400">
          <div>
            GI threshold: {data.gi_threshold ?? 0.95} · Current:{' '}
            {giCur != null && Number.isFinite(giCur) ? giCur.toFixed(2) : '—'}
          </div>
          <div>Sustain cycles required: {data.sustain_cycles_required ?? 5}</div>
          <div>
            preview_active: {data.preview_active ? 'true' : 'false'} (preview band at GI ≥ 0.88)
          </div>
          <div>source_entries: {data.source_entries ?? 0}</div>
          <div>last_deposit: {data.last_deposit ?? 'null'}</div>
        </div>
      </div>

      <div className="mt-4 rounded border border-slate-700/50 bg-slate-950/60 p-4 font-mono text-xs">
        <div className="mb-2 text-[11px] uppercase tracking-[0.2em] text-violet-300/80">Path to unsealing</div>
        {(() => {
          const giThresh = data.gi_threshold ?? 0.95;
          const giGap = giCur != null ? Math.max(0, giThresh - giCur) : giThresh;
          const sustain = data.sustain_cycles_required ?? 5;
          const reserveGap = Math.max(0, cap - bal);
          const giReady = giCur != null && giCur >= giThresh;
          const reserveReady = bal >= cap;

          return (
            <div className="space-y-2.5">
              <div>
                <div className="mb-1 flex items-center justify-between text-[10px]">
                  <span className="text-slate-400">GI ≥ {giThresh.toFixed(2)}</span>
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
                <div className="mt-0.5 text-[9px] text-slate-600">
                  Primary blockers: freshness ({((data as Record<string, unknown>).signals as Record<string, number> | undefined)?.freshness?.toFixed(2) ?? '?'}), information quality
                </div>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between text-[10px]">
                  <span className="text-slate-400">Reserve ≥ {cap.toFixed(0)} units</span>
                  <span className={reserveReady ? 'text-emerald-400' : 'text-amber-400'}>
                    {reserveReady ? 'MET' : `need: ${reserveGap.toFixed(2)} more`}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded bg-slate-800">
                  <div
                    className="h-full rounded transition-all duration-500"
                    style={{
                      width: `${pct}%`,
                      background: reserveReady ? '#10b981' : '#a78bfa',
                    }}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-slate-400">Sustain GI ≥ {giThresh} for {sustain} cycles</span>
                  <span className="text-slate-500">tracking</span>
                </div>
              </div>

              <p className="mt-1 text-[9px] leading-relaxed text-slate-600">
                The vault unseals when GI sustains above {giThresh} for {sustain} consecutive cycles and reserve exceeds {cap} units. Fountain activation converts reserve to spendable MIC.
              </p>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
