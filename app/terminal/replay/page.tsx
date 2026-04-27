'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

type ReplaySourceStatus = 'available' | 'partial' | 'missing' | 'unsafe';

type ReplaySource = {
  id: string;
  layer: number;
  label: string;
  status: ReplaySourceStatus;
  count?: number;
  detail: string;
};

type ReplayPlan = {
  ok: boolean;
  version: string;
  timestamp: string;
  cycle: string;
  mode: 'plan' | 'dry_run';
  destructive: boolean;
  sources: ReplaySource[];
  rebuild: {
    possible: boolean;
    confidence: number;
    can_restore_hot_state: boolean;
    can_restore_vault_state: boolean;
    can_restore_chamber_savepoints: boolean;
    unsafe_to_restore: string[];
    would_restore: string[];
  };
  vault: {
    in_progress_balance: number;
    in_progress_hash_count: number;
    attested_seals: number;
    quarantined_seals: number;
    finalized_seals: number;
    latest_seal_id: string | null;
    latest_seal_hash: string | null;
    candidate_seal_id: string | null;
    recent_seals: Array<{
      seal_id: string;
      sequence: number;
      status: string;
      seal_hash: string;
      prev_seal_hash: string | null;
      substrate_attestation_id?: string | null;
      substrate_event_hash?: string | null;
    }>;
    quarantined_seal_ids: string[];
  };
  hot_state: {
    gi_available: boolean;
    gi_carry_available: boolean;
    signal_available: boolean;
    echo_available: boolean;
    tripwire_available: boolean;
  };
  savepoints: {
    total_matched: number;
    sampled: number;
  };
  canon: string;
  note?: string;
};

function confidenceLabel(confidence: number): { label: string; className: string } {
  if (confidence >= 0.85) return { label: 'STRONG', className: 'text-emerald-300' };
  if (confidence >= 0.5) return { label: 'PARTIAL', className: 'text-amber-300' };
  return { label: 'UNSAFE', className: 'text-rose-300' };
}

function statusClass(status: ReplaySourceStatus): string {
  switch (status) {
    case 'available':
      return 'border-emerald-500/30 bg-emerald-950/20 text-emerald-200';
    case 'partial':
      return 'border-amber-500/30 bg-amber-950/20 text-amber-200';
    case 'unsafe':
      return 'border-rose-500/30 bg-rose-950/20 text-rose-200';
    default:
      return 'border-slate-700 bg-slate-950/70 text-slate-400';
  }
}

function shortHash(value?: string | null): string {
  if (!value) return '—';
  if (value.length <= 22) return value;
  return `${value.slice(0, 14)}…${value.slice(-8)}`;
}

function formatTime(value?: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function BoolPill({
  label,
  value,
  trueLabel = 'available',
  falseLabel = 'missing',
  trueClassName = 'text-emerald-300',
  falseClassName = 'text-slate-500',
}: {
  label: string;
  value: boolean;
  trueLabel?: string;
  falseLabel?: string;
  trueClassName?: string;
  falseClassName?: string;
}) {
  return (
    <div className="flex items-center justify-between rounded border border-slate-800 bg-slate-950/70 px-3 py-2 text-[10px]">
      <span className="uppercase tracking-[0.16em] text-slate-500">{label}</span>
      <span className={value ? trueClassName : falseClassName}>{value ? trueLabel : falseLabel}</span>
    </div>
  );
}

export default function ReplayPage() {
  const [plan, setPlan] = useState<ReplayPlan | null>(null);
  const [dryRun, setDryRun] = useState<ReplayPlan | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    void fetch('/api/system/replay/plan', { cache: 'no-store' })
      .then(async (r) => {
        const payload = (await r.json()) as ReplayPlan;
        if (!r.ok || !payload.ok) throw new Error('replay_plan_failed');
        setPlan(payload);
      })
      .catch(() => setErr('Unable to load replay plan'));
  }, []);

  const active = dryRun ?? plan;
  const confidence = useMemo(() => confidenceLabel(active?.rebuild.confidence ?? 0), [active]);
  const confidencePct = useMemo(() => {
    const raw = active?.rebuild.confidence ?? 0;
    return Math.max(0, Math.min(100, Math.round(raw * 100)));
  }, [active]);
  const sortedSources = useMemo(() => {
    if (!active?.sources) return [];
    return [...active.sources].sort((a, b) => a.layer - b.layer);
  }, [active]);

  async function runDryReplay() {
    setRunning(true);
    setErr(null);
    try {
      const r = await fetch('/api/system/replay/dry-run', { method: 'POST', cache: 'no-store' });
      const payload = (await r.json()) as ReplayPlan;
      if (!r.ok || !payload.ok) throw new Error('dry_run_failed');
      setDryRun(payload);
    } catch {
      setErr('Replay dry run failed');
    } finally {
      setRunning(false);
    }
  }

  if (err && !active) return <div className="p-4 text-sm text-rose-300">{err}</div>;
  if (!active) return <div className="p-4 text-sm text-slate-400">Loading replay inspector…</div>;

  return (
    <div className="h-full overflow-y-auto p-4 font-mono text-xs text-slate-200">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Mobius Recovery</div>
          <h1 className="mt-1 text-sm font-semibold uppercase tracking-[0.16em] text-violet-200">Replay Inspector</h1>
          <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-slate-500">Dry-run recovery view for reconstructing Mobius state from canon without mutating KV, Vault, Journal, Ledger, or Substrate.</p>
        </div>
        <div className="flex gap-2 text-[10px]">
          <Link href="/terminal/canon" className="rounded border border-slate-700 px-2 py-1 text-slate-400 hover:border-cyan-500/50 hover:text-cyan-300">Canon</Link>
          <Link href="/terminal/vault" className="rounded border border-slate-700 px-2 py-1 text-slate-400 hover:border-violet-500/50 hover:text-violet-300">Vault</Link>
        </div>
      </div>

      {err ? <div className="mb-3 rounded border border-rose-500/30 bg-rose-950/20 p-3 text-[11px] text-rose-200">{err}</div> : null}

      <div className="mb-4 grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded border border-violet-500/25 bg-slate-950/80 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-violet-300/80">Replay state · {active.mode}</div>
              <div className="mt-1 text-[10px] text-slate-500">{active.version} · {active.cycle} · {formatTime(active.timestamp)}</div>
            </div>
            <div className={active.rebuild.possible ? 'text-emerald-300' : 'text-rose-300'}>{active.rebuild.possible ? 'REBUILD POSSIBLE' : 'REBUILD BLOCKED'}</div>
          </div>
          <div className="mb-2 flex items-center justify-between text-[10px]"><span className="text-slate-500">confidence</span><span className={confidence.className}>{confidence.label} · {confidencePct}%</span></div>
          <div className="h-2 overflow-hidden rounded bg-slate-800"><div className="h-full rounded bg-violet-400 transition-all duration-500" style={{ width: `${confidencePct}%` }} /></div>
          <p className="mt-3 text-[10px] leading-relaxed text-slate-500">{active.canon}</p>
          {active.note ? <p className="mt-2 text-[10px] text-cyan-300">{active.note}</p> : null}
          <button
            type="button"
            onClick={runDryReplay}
            disabled={running}
            className="mt-4 rounded border border-cyan-500/40 bg-cyan-950/20 px-3 py-2 text-[10px] uppercase tracking-[0.16em] text-cyan-200 hover:border-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {running ? 'Running dry replay…' : 'Run Dry Replay Simulation'}
          </button>
        </section>

        <section className="rounded border border-slate-800 bg-slate-950/70 p-4">
          <div className="mb-3 text-[10px] uppercase tracking-[0.2em] text-violet-300/80">Restore summary</div>
          <div className="grid gap-2 sm:grid-cols-2">
            <BoolPill label="Hot state" value={active.rebuild.can_restore_hot_state} />
            <BoolPill label="Vault state" value={active.rebuild.can_restore_vault_state} />
            <BoolPill label="Savepoints" value={active.rebuild.can_restore_chamber_savepoints} />
            <BoolPill label="Destructive" value={active.destructive} trueLabel="true" falseLabel="false" trueClassName="text-rose-300" falseClassName="text-emerald-300" />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-[0.16em] text-slate-500">would restore</div>
              <div className="space-y-1">{active.rebuild.would_restore.length ? active.rebuild.would_restore.map((item) => <div key={item} className="text-emerald-300">✓ {item}</div>) : <div className="text-slate-500">none</div>}</div>
            </div>
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-[0.16em] text-slate-500">unsafe blockers</div>
              <div className="space-y-1">{active.rebuild.unsafe_to_restore.length ? active.rebuild.unsafe_to_restore.map((item) => <div key={item} className="text-rose-300">× {item}</div>) : <div className="text-emerald-300">none</div>}</div>
            </div>
          </div>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="rounded border border-slate-800 bg-slate-950/70 p-4">
          <div className="mb-3 text-[10px] uppercase tracking-[0.2em] text-violet-300/80">8-layer rebuild ladder</div>
          <div className="space-y-2">
            {sortedSources.map((src) => (
              <div key={src.id} className="grid gap-2 rounded border border-slate-800 bg-slate-950/60 p-3 sm:grid-cols-[42px_1fr_110px]">
                <div className="text-cyan-300">L{src.layer}</div>
                <div>
                  <div className="text-slate-200">{src.label}</div>
                  <div className="mt-1 text-[10px] leading-relaxed text-slate-500">{src.detail}</div>
                </div>
                <div className={`self-start rounded border px-2 py-1 text-center text-[10px] uppercase tracking-[0.12em] ${statusClass(src.status)}`}>{src.status}</div>
              </div>
            ))}
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded border border-cyan-900/40 bg-slate-950/70 p-4">
            <div className="mb-3 text-[10px] uppercase tracking-[0.2em] text-cyan-300/80">Vault replay snapshot</div>
            <div className="space-y-1 text-[10px] text-slate-400">
              <div>in_progress_balance: <span className="text-cyan-100">{active.vault.in_progress_balance.toFixed(4)}</span></div>
              <div>in_progress_hashes: <span className="text-cyan-100">{active.vault.in_progress_hash_count}</span></div>
              <div>attested_seals: <span className="text-cyan-100">{active.vault.attested_seals}</span></div>
              <div>quarantined_seals: <span className={active.vault.quarantined_seals > 0 ? 'text-amber-300' : 'text-cyan-100'}>{active.vault.quarantined_seals ?? 0}</span></div>
              <div>finalized_seals: <span className="text-cyan-100">{active.vault.finalized_seals}</span></div>
              <div>candidate: <span className="text-cyan-100">{active.vault.candidate_seal_id ?? '—'}</span></div>
              <div>latest: <span className="text-cyan-100">{active.vault.latest_seal_id ?? '—'}</span></div>
              <div title={active.vault.latest_seal_hash ?? undefined}>latest_hash: <span className="text-violet-200">{shortHash(active.vault.latest_seal_hash)}</span></div>
            </div>
            <div className="mt-3 text-[10px] uppercase tracking-[0.16em] text-slate-500">recent seals</div>
            <div className="mt-1 space-y-1.5">
              {active.vault.recent_seals.length ? active.vault.recent_seals.map((seal) => (
                <div key={seal.seal_id} className={`rounded border p-2 text-[10px] ${seal.status === 'quarantined' ? 'border-amber-600/40 bg-amber-950/20' : 'border-slate-800/80 bg-slate-950/60'}`}>
                  <div className="flex justify-between gap-2"><span className="text-cyan-200">#{seal.sequence}</span><span className={seal.status === 'quarantined' ? 'text-amber-300' : 'text-slate-400'}>{seal.status}</span></div>
                  <div className="mt-1 text-violet-200" title={seal.seal_hash}>{shortHash(seal.seal_hash)}</div>
                </div>
              )) : <div className="text-[10px] text-slate-500">No recent seals.</div>}
            </div>
            {(active.vault.quarantined_seal_ids?.length ?? 0) > 0 ? (
              <div className="mt-3">
                <div className="mb-1 text-[10px] uppercase tracking-[0.16em] text-amber-400/80">quarantined — need reattestation</div>
                <div className="space-y-1">
                  {active.vault.quarantined_seal_ids.map((id) => (
                    <div key={id} className="rounded border border-amber-700/30 bg-amber-950/10 px-2 py-1 text-[10px] text-amber-200">{id}</div>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          <section className="rounded border border-slate-800 bg-slate-950/70 p-4">
            <div className="mb-3 text-[10px] uppercase tracking-[0.2em] text-violet-300/80">Hot state availability</div>
            <div className="grid gap-2">
              <BoolPill label="GI live" value={active.hot_state.gi_available} />
              <BoolPill label="GI carry" value={active.hot_state.gi_carry_available} />
              <BoolPill label="Signals" value={active.hot_state.signal_available} />
              <BoolPill label="ECHO" value={active.hot_state.echo_available} />
              <BoolPill label="Tripwire" value={active.hot_state.tripwire_available} />
            </div>
            <div className="mt-3 text-[10px] text-slate-500">savepoints: {active.savepoints.total_matched} matched · {active.savepoints.sampled} sampled</div>
          </section>

          <section className="rounded border border-slate-800 bg-slate-950/70 p-4 text-[10px] text-slate-500">
            <div className="mb-2 uppercase tracking-[0.2em] text-violet-300/80">Handbook</div>
            <div>Replay is documented in the Mobius-Substrate handbook.</div>
            <a href="https://kaizencycle.github.io/Mobius-Substrate/" target="_blank" rel="noreferrer" className="mt-2 inline-block text-cyan-300 hover:text-cyan-100">Open Substrate handbook →</a>
          </section>
        </aside>
      </div>
    </div>
  );
}
