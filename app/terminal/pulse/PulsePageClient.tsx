'use client';

/**
 * C-305 FIX-507-08: Pulse chamber client — unified data wiring.
 * Fetches from /api/chambers/pulse (single aggregated request) and maps
 * all 9 data sources to their display panels. Replaces N-fetch pattern.
 * Refresh interval: 15s to match the aggregator KV cache TTL.
 */

import { useState, useEffect, useCallback } from 'react';
import type { PulsePayload } from '@/app/api/chambers/pulse/route';

export default function PulsePageClient() {
  const [pulse, setPulse] = useState<PulsePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastFetch, setLastFetch] = useState<number>(0);

  const loadPulse = useCallback(async () => {
    try {
      const res = await fetch('/api/chambers/pulse');
      if (!res.ok) return;
      const data = (await res.json()) as PulsePayload;
      setPulse(data);
      setLastFetch(Date.now());
    } catch (e) {
      console.warn('[pulse] fetch failed:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPulse();
    const interval = setInterval(() => void loadPulse(), 15_000);
    return () => clearInterval(interval);
  }, [loadPulse]);

  // ── Derived values ──────────────────────────────────────────────────
  const snap     = pulse?.snapshot as Record<string, unknown> | null ?? null;
  const gi       = (pulse?.integrityStatus as Record<string, unknown> | null)?.gi as number | null
                   ?? (snap?.gi as number | null)
                   ?? null;
  const cycle    = pulse?._meta?.cycle ?? (snap?.cycle as string | null) ?? '—';
  const epiconRaw = pulse?.epicon as Record<string, unknown> | null;
  const epicon   = ((epiconRaw?.items ?? epiconRaw) as unknown[] | null) ?? [];
  // /api/agents/journal returns { entries: [...] } — unwrap the envelope
  const agentJournalRaw = pulse?.agentJournal as { entries?: unknown[] } | unknown[] | null;
  const agents   = (Array.isArray(agentJournalRaw)
    ? agentJournalRaw
    : (agentJournalRaw as { entries?: unknown[] } | null)?.entries ?? []);
  const miiRaw   = pulse?.mii as Record<string, unknown> | null;
  const miiScore = (miiRaw?.composite ?? miiRaw?.score) as number | null ?? null;
  const vaultRaw = pulse?.vaultStatus as Record<string, unknown> | null;
  const vaultSeals   = (vaultRaw?.seals as unknown[] | null) ?? [];
  const vaultSustain = vaultRaw?.sustain as number | null ?? null;
  // /api/chambers/lane-diagnostics returns lanes as an object map { name: state }
  // Convert to array for rendering; handle both object and legacy array shapes.
  const lanesRaw = pulse?.laneDiagnostics as Record<string, unknown> | null;
  const lanesObj = lanesRaw?.lanes;
  const lanes: Array<{ name: string; state?: unknown; ok?: unknown }> =
    Array.isArray(lanesObj)
      ? (lanesObj as Array<{ name: string; state?: unknown }>)
      : lanesObj && typeof lanesObj === 'object'
        ? Object.entries(lanesObj as Record<string, unknown>).map(([name, val]) =>
            val && typeof val === 'object'
              ? { name, ...(val as Record<string, unknown>) }
              : { name, state: val }
          )
        : [];
  const echoRaw  = pulse?.echoDigest as Record<string, unknown> | null;
  const canon    = pulse?.substrateCanon as Record<string, unknown> | null;
  const freshMs  = lastFetch ? Date.now() - lastFetch : null;

  const giColor  = gi == null ? 'text-slate-500'
    : gi >= 0.85 ? 'text-emerald-400'
    : gi >= 0.70 ? 'text-amber-400'
    : 'text-red-400';

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3 md:p-4">

      {/* ── Meta bar ── */}
      <div className="flex items-center justify-between rounded border border-slate-800 bg-slate-950/60 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-slate-400">
        <span>Pulse · {cycle}</span>
        <span className="flex items-center gap-2">
          <span className={giColor}>
            GI {gi != null ? gi.toFixed(3) : '—'}
          </span>
          <span className="text-slate-600">·</span>
          <span className={freshMs != null && freshMs < 20_000 ? 'text-emerald-500' : 'text-amber-400'}>
            {freshMs != null ? `${Math.floor(freshMs / 1000)}s ago` : 'syncing'}
          </span>
          {loading && <span className="animate-pulse text-slate-600">↻</span>}
        </span>
      </div>

      {/* ── Row 1: GI · MII · Vault sustain ── */}
      <div className="grid grid-cols-3 gap-2">
        <MetricTile
          label="GI"
          value={gi?.toFixed(3)}
          status={gi == null ? 'unknown' : gi >= 0.85 ? 'nominal' : gi >= 0.70 ? 'stressed' : 'critical'}
        />
        <MetricTile
          label="MII"
          value={miiScore?.toFixed(3)}
          status={miiScore == null ? 'unknown' : miiScore >= 0.75 ? 'nominal' : 'stressed'}
        />
        <MetricTile
          label="Vault sustain"
          value={vaultSustain != null ? `${vaultSustain}/5` : '—'}
          status={vaultSustain == null ? 'unknown' : vaultSustain >= 5 ? 'nominal' : vaultSustain >= 3 ? 'stressed' : 'critical'}
        />
      </div>

      {/* ── Row 2: Lane diagnostics ── */}
      <section className="rounded border border-slate-800 bg-slate-950/60 px-3 py-2">
        <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">Lane diagnostics</div>
        <div className="grid grid-cols-2 gap-1 md:grid-cols-3">
          {lanes.length === 0
            ? <p className="col-span-3 text-[10px] text-slate-600">No lane data</p>
            : (lanes as Array<Record<string, unknown>>).map((lane) => (
              <div key={String(lane.name ?? lane.key ?? '')} className="flex items-center justify-between rounded bg-slate-900/60 px-2 py-1">
                <span className="font-mono text-[9px] uppercase tracking-wide text-slate-400">
                  {String(lane.name ?? lane.key ?? '—')}
                </span>
                <span className={`font-mono text-[10px] ${
                  lane.state === 'ok' || lane.ok === true ? 'text-emerald-400'
                  : lane.state === 'stale' ? 'text-amber-400'
                  : 'text-red-400'
                }`}>
                  {String(lane.state ?? (lane.ok ? 'ok' : 'err'))}
                </span>
              </div>
            ))
          }
        </div>
      </section>

      {/* ── Row 3: EPICON feed ── */}
      <section className="flex-1 rounded border border-slate-800 bg-slate-950/60 px-3 py-2">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">EPICON feed</span>
          <span className="font-mono text-[9px] text-slate-600">{epicon.length} events</span>
        </div>
        <div className="max-h-48 space-y-1 overflow-y-auto">
          {epicon.length === 0
            ? <p className="text-[10px] text-slate-600">No EPICON events in current cycle</p>
            : (epicon as Array<Record<string, unknown>>).slice(0, 30).map((ev, i) => {
                const conf = (ev.confidence ?? ev.mii_score) as number | null ?? null;
                return (
                  <div key={String(ev.id ?? i)} className="flex items-start gap-2 rounded bg-slate-900/40 px-2 py-1">
                    {conf != null && (
                      <span className={`mt-0.5 shrink-0 rounded px-1 font-mono text-[8px] uppercase ${
                        conf >= 0.9 ? 'bg-emerald-900/40 text-emerald-400'
                        : conf >= 0.7 ? 'bg-amber-900/40 text-amber-400'
                        : 'bg-slate-800 text-slate-500'
                      }`}>{Math.round(conf * 100)}%</span>
                    )}
                    <span className="min-w-0 truncate font-mono text-[10px] text-slate-300">
                      {String(ev.title ?? ev.summary ?? ev.id ?? '—')}
                    </span>
                    <span className="shrink-0 font-mono text-[9px] text-slate-600">
                      {String(ev.agent ?? ev.author ?? '—')}
                    </span>
                  </div>
                );
              })
          }
        </div>
      </section>

      {/* ── Row 4: Agent journal · Echo digest ── */}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <section className="rounded border border-slate-800 bg-slate-950/60 px-3 py-2">
          <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">Agent journal</div>
          <div className="max-h-32 space-y-1 overflow-y-auto">
            {agents.length === 0
              ? <p className="text-[10px] text-slate-600">No journal entries</p>
              : (agents as Array<Record<string, unknown>>).slice(0, 10).map((e, i) => (
                <div key={String(e.id ?? i)} className="flex items-center gap-2">
                  <span className="w-16 shrink-0 font-mono text-[9px] uppercase text-slate-500">
                    {String(e.agent ?? '—')}
                  </span>
                  <span className="min-w-0 truncate text-[10px] text-slate-300">
                    {String(e.message ?? e.observation ?? e.summary ?? '—')}
                  </span>
                </div>
              ))
            }
          </div>
        </section>

        <section className="rounded border border-slate-800 bg-slate-950/60 px-3 py-2">
          <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">ECHO digest</div>
          {echoRaw
            ? (
              <div className="space-y-1 font-mono text-[10px]">
                <div className="flex justify-between">
                  <span className="text-slate-500">Hash</span>
                  <span className="text-cyan-400">{String(echoRaw.hash ?? '—').slice(0, 12)}…</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Age</span>
                  <span className="text-slate-300">{String(echoRaw.age ?? '—')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Entries</span>
                  <span className="text-slate-300">{String(echoRaw.count ?? '—')}</span>
                </div>
              </div>
            )
            : <p className="text-[10px] text-slate-600">Digest unavailable</p>
          }
        </section>
      </div>

      {/* ── Row 5: Vault seals · Substrate canon ── */}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <section className="rounded border border-slate-800 bg-slate-950/60 px-3 py-2">
          <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">Vault seals</div>
          {vaultSeals.length === 0
            ? <p className="text-[10px] text-slate-600">No seals in current cycle</p>
            : (vaultSeals as Array<Record<string, unknown>>).slice(0, 8).map((s) => (
              <div key={String(s.seal_id ?? s.sealId ?? '')} className="flex items-center justify-between py-0.5">
                <span className="font-mono text-[9px] text-slate-400">
                  {String(s.seal_id ?? s.sealId ?? '—')}
                </span>
                <span className={`font-mono text-[9px] ${
                  s.status === 'attested' || s.status === 'promoted' ? 'text-emerald-400'
                  : s.status === 'quarantined' ? 'text-red-400'
                  : 'text-amber-400'
                }`}>
                  {String(s.status ?? '—')}
                </span>
              </div>
            ))
          }
        </section>

        <section className="rounded border border-slate-800 bg-slate-950/60 px-3 py-2">
          <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">Substrate canon</div>
          {canon
            ? (
              <div className="space-y-1 font-mono text-[10px]">
                <div className="flex justify-between">
                  <span className="text-slate-500">Head</span>
                  <span className="text-violet-400">{String(canon.head ?? '—').slice(0, 10)}…</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Cycle</span>
                  <span className="text-slate-300">{String(canon.cycle ?? '—')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Entries</span>
                  <span className="text-slate-300">{String(canon.entryCount ?? canon.count ?? '—')}</span>
                </div>
              </div>
            )
            : <p className="text-[10px] text-slate-600">Canon unavailable</p>
          }
        </section>
      </div>

    </div>
  );
}

// ── Shared metric tile ───────────────────────────────────────────────────────
function MetricTile({ label, value, status }: {
  label: string;
  value: string | undefined;
  status: 'nominal' | 'stressed' | 'critical' | 'unknown';
}) {
  const color =
    status === 'nominal'  ? 'border-emerald-700/50 text-emerald-300' :
    status === 'stressed' ? 'border-amber-700/50 text-amber-300' :
    status === 'critical' ? 'border-red-700/50 text-red-400' :
    'border-slate-700 text-slate-500';
  return (
    <div className={`rounded border px-3 py-2 ${color}`}>
      <div className="font-mono text-[9px] uppercase tracking-[0.18em] opacity-60">{label}</div>
      <div className="mt-1 font-mono text-xl">{value ?? '—'}</div>
    </div>
  );
}
