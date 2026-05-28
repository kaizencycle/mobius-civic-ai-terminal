'use client';
import { useState, useEffect, useRef } from 'react';
// ── Types ─────────────────────────────────────────────────────
interface EPICONEvent {
  event_id: string; title?: string; summary?: string;
  agent?: string; confidence?: number; severity?: string;
  tags?: string[]; attested_at?: number; cycle?: string;
  source?: string;
}
interface Heartbeats {
  journal: number | null; runtime: number | null;
  vault: number | null;   sweep: number | null;
}
interface PulseSnapshot {
  gi?: number; cycle?: string; systemStatus?: string;
  promotionStatus?: string; promotionAgeMinutes?: number;
}
interface VaultStatus {
  seals?: { sealId: string; status: string }[];
  sustain?: number; mic?: { provisioned: number; minted: number };
  reserve?: number; unlockCondition?: string; treasuryLane?: string;
}
interface LaneDiag {
  lanes?: Record<string, { status?: string; [key: string]: unknown }>;
  degradedCount?: number;
}
interface AgentJournalEntry {
  id?: string; agent?: string; message?: string;
  summary?: string; cycle?: string; ts?: number;
}
interface SearchResult {
  source: string; event_id?: string; title?: string;
  summary?: string; message?: string; agent?: string;
  cycle?: string; confidence?: number; severity?: string;
  tags?: string[]; attested_at?: number; writtenAt?: number;
  status?: string; sealId?: string;
  [key: string]: unknown;
}
interface SearchState {
  query: string; loading: boolean; results: SearchResult[];
  count: number; queryType: string; error: string | null;
}
function fmtAge(ts: number | null): string {
  if (!ts) return '—';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}
type Tab = 'overview' | 'signals' | 'tripwires' | 'vault' | 'agents' | 'ledger' | 'browser';
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'overview',  label: 'Overview',  icon: '🧠' },
  { id: 'signals',   label: 'Signals',   icon: '📡' },
  { id: 'tripwires', label: 'Tripwires', icon: '⚠️' },
  { id: 'vault',     label: 'Vault',     icon: '🧱' },
  { id: 'agents',    label: 'Agents',    icon: '🤖' },
  { id: 'ledger',    label: 'Ledger',    icon: '📜' },
  { id: 'browser',   label: 'Browser',   icon: '⎕'  },
];
// ── Component ─────────────────────────────────────────────────────
export default function PulsePage() {
  const [tab, setTab]               = useState<Tab>('overview');
  const [epicon, setEpicon]         = useState<EPICONEvent[]>([]);
  const [heartbeats, setHeartbeats] = useState<Heartbeats>({ journal: null, runtime: null, vault: null, sweep: null });
  const [snapshot, setSnapshot]     = useState<PulseSnapshot>({});
  const [vaultStatus, setVault]     = useState<VaultStatus>({});
  const [laneDiag, setLaneDiag]     = useState<LaneDiag>({});
  const [agentJournal, setAgents]   = useState<AgentJournalEntry[]>([]);
  const [loading, setLoading]       = useState(true);
  const [inputVal, setInputVal]     = useState('');
  const [search, setSearch]         = useState<SearchState>({
    query: '', loading: false, results: [], count: 0, queryType: '', error: null,
  });
  const inputRef = useRef<HTMLInputElement>(null);
  // ── Data fetches ─────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const [epiRes, hbRes, snapRes, vaultRes, laneRes, agentRes] = await Promise.allSettled([
          fetch('/api/epicon/feed?limit=50').then(r => r.json()),
          fetch('/api/health/heartbeats').then(r => r.json()),
          fetch('/api/terminal/snapshot').then(r => r.json()),
          fetch('/api/vault/status').then(r => r.json()),
          fetch('/api/chambers/lane-diagnostics').then(r => r.json()),
          fetch('/api/agents/journal').then(r => r.json()),
        ]);
        if (epiRes.status === 'fulfilled') setEpicon(Array.isArray(epiRes.value) ? epiRes.value : (epiRes.value.items ?? []));
        if (hbRes.status === 'fulfilled') {
          const d = hbRes.value;
          const toMs = (v: string | null | undefined): number | null => v ? new Date(v).getTime() : null;
          setHeartbeats({ journal: toMs(d.journal), runtime: toMs(d.runtime), vault: toMs(d.vault), sweep: toMs(d.promote) });
        }
        if (snapRes.status === 'fulfilled') setSnapshot(snapRes.value);
        if (vaultRes.status === 'fulfilled') setVault(vaultRes.value);
        if (laneRes.status === 'fulfilled') setLaneDiag(laneRes.value);
        if (agentRes.status === 'fulfilled') setAgents(Array.isArray(agentRes.value) ? agentRes.value : (agentRes.value.entries ?? []));
      } catch {} finally { setLoading(false); }
    }
    load();
    const t1 = setInterval(() => load(), 30_000);
    return () => clearInterval(t1);
  }, []);
  // ── Search ──────────────────────────────────────────────────────────
  async function runSearch(q: string) {
    const trimmed = q.trim();
    if (!trimmed) { clearSearch(); return; }
    setSearch(s => ({ ...s, query: trimmed, loading: true, error: null }));
    setTab('browser');
    try {
      const res = await fetch(`/api/pulse/search?q=${encodeURIComponent(trimmed)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Search failed');
      setSearch({ query: trimmed, loading: false, results: data.results, count: data.count, queryType: data.queryType, error: null });
    } catch (err) {
      setSearch(s => ({ ...s, loading: false, error: String(err) }));
    }
  }
  function clearSearch() {
    setSearch({ query: '', loading: false, results: [], count: 0, queryType: '', error: null });
    setInputVal('');
    setTab('overview');
    inputRef.current?.focus();
  }
  // ── Derived ──────────────────────────────────────────────────────────
  const gi      = snapshot.gi;
  const cycle   = snapshot.cycle ?? '—';
  const giClass = gi == null ? 'text-slate-500' : gi >= 0.85 ? 'text-emerald-400' : gi >= 0.70 ? 'text-amber-400' : 'text-red-400';
  const statusColor = snapshot.systemStatus === 'nominal' ? 'text-emerald-400 border-emerald-700/50' : snapshot.systemStatus === 'degraded' ? 'text-amber-400 border-amber-700/50' : 'text-slate-500 border-slate-700';
  const laneDiagArr = Object.entries(laneDiag.lanes ?? {}).map(([name, val]) => ({ name, status: val.status }));
  const degradedLanes = laneDiagArr.filter(l => l.status !== 'ok');
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* ── Heartbeat rail ────────────────────────────── */}
      <div className="shrink-0 border-b border-white/[0.06] bg-[#020408]/80 px-3 py-1.5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10px] uppercase tracking-[0.14em]">
          <span className="text-slate-500">KV hb</span>
          {([
            { label: 'Journal', ts: heartbeats.journal, max: 300_000 },
            { label: 'Runtime', ts: heartbeats.runtime, max: 120_000 },
            { label: 'Vault',   ts: heartbeats.vault,   max: 600_000 },
            { label: 'Sweep',   ts: heartbeats.sweep,   max: 1_800_000 },
          ] as const).map(({ label, ts, max }) => {
            const fresh = ts != null && Date.now() - ts < max;
            return (
              <span key={label} className="flex items-center gap-1">
                <span className={`h-1.5 w-1.5 rounded-full ${ts == null ? 'bg-slate-700' : fresh ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                <span className="text-slate-500">{label}</span>
                <span className={ts == null ? 'text-slate-600' : fresh ? 'text-emerald-300' : 'text-amber-300'}>{fmtAge(ts)}</span>
              </span>
            );
          })}
        </div>
      </div>
      {/* ── Search bar ───────────────────────────────── */}
      <div className="shrink-0 border-b border-white/[0.06] bg-[#020408]/90 px-3 py-1.5">
        <div className="flex items-center gap-2">
          <span className="shrink-0 font-mono text-[10px] text-slate-600">⎕</span>
          <input
            ref={inputRef}
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') runSearch(inputVal); if (e.key === 'Escape') clearSearch(); }}
            placeholder="C-298 · ATLAS · seal-C-298-001 · any tag or event ID"
            className="flex-1 bg-transparent font-mono text-[11px] text-sky-300 placeholder:text-slate-700 outline-none"
          />
          {inputVal && !search.query && (
            <button onClick={() => runSearch(inputVal)}
              className="shrink-0 rounded border border-slate-700 px-2 py-0.5 font-mono text-[9px] uppercase text-slate-400 hover:border-slate-500 hover:text-slate-200">
              Search
            </button>
          )}
          {search.query && (
            <button onClick={clearSearch}
              className="shrink-0 rounded border border-slate-700 px-2 py-0.5 font-mono text-[9px] uppercase text-slate-400 hover:border-red-700 hover:text-red-300">
              ✕ Clear
            </button>
          )}
        </div>
      </div>
      {/* ── Tab bar ────────────────────────────────────── */}
      <div className="shrink-0 flex gap-0.5 overflow-x-auto border-b border-white/[0.06] bg-[#020408]/70 px-2 pt-1.5">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 flex items-center gap-1 rounded-t px-2.5 pb-1.5 pt-1 font-mono text-[9px] uppercase tracking-[0.14em] transition-colors ${
              tab === t.id
                ? 'border-b-2 border-cyan-400 text-cyan-300 bg-cyan-950/20'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <span>{t.icon}</span>
            <span className="hidden md:inline">{t.label}</span>
          </button>
        ))}
      </div>
      {/* ── Tab content — scrollable ────────────────────── */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]">
        {/* OVERVIEW ─────────────────────────────────────────── */}
        {tab === 'overview' && (
          <div className="space-y-3 p-3">
            {/* Status bar */}
            <div className="flex items-center justify-between rounded border border-slate-800 bg-slate-950/60 px-3 py-2">
              <div>
                <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">Mobius Pulse · {cycle}</p>
                <p className={`mt-0.5 font-mono text-lg font-semibold ${giClass}`}>
                  GI {gi != null ? gi.toFixed(3) : '—'}
                </p>
              </div>
              <div className="text-right">
                <span className={`rounded border px-2 py-0.5 font-mono text-[10px] uppercase ${statusColor}`}>
                  {snapshot.systemStatus ?? 'boot'}
                </span>
                <p className="mt-1 font-mono text-[9px] text-slate-500">{epicon.length} EPICON events</p>
              </div>
            </div>
            {/* GI Sparkline — ATLAS C-325 heartbeat history (PULSE-01 / G-06) */}
            <div className="rounded border border-slate-800 bg-slate-950/60 px-3 py-2">
              <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">
                ATLAS heartbeat · C-325 · KV-source
              </p>
              {(() => {
                const history = [0.64, 0.74, 0.791, 0.809, 0.81, 0.81, 0.814, 0.82, 0.9, 0.9, gi ?? 0.82].filter(v => v > 0);
                const W = 300; const H = 40; const pad = 2;
                const min = Math.min(...history, 0.60);
                const max = Math.max(...history, 1.00);
                const range = max - min || 0.01;
                const pts = history.map((v, i) => {
                  const x = pad + (i / (history.length - 1)) * (W - 2 * pad);
                  const y = pad + (1 - (v - min) / range) * (H - 2 * pad);
                  return `${x.toFixed(1)},${y.toFixed(1)}`;
                }).join(' ');
                const last = history[history.length - 1] ?? 0;
                const barColor = (v: number) => v >= 0.75 ? '#34d399' : v >= 0.65 ? '#fbbf24' : '#f87171';
                return (
                  <div>
                    <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-10" aria-hidden="true">
                      <polyline points={pts} fill="none" stroke={barColor(last)} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
                      {history.map((v, i) => {
                        const x = pad + (i / (history.length - 1)) * (W - 2 * pad);
                        const y = pad + (1 - (v - min) / range) * (H - 2 * pad);
                        return <circle key={i} cx={x} cy={y} r={i === history.length - 1 ? 2.5 : 1.5} fill={barColor(v)} opacity={i === history.length - 1 ? 1 : 0.6} />;
                      })}
                    </svg>
                    <div className="mt-1 flex items-center gap-3 font-mono text-[9px] text-slate-600">
                      <span><span className="text-emerald-400">●</span> ≥ 0.75</span>
                      <span><span className="text-amber-400">●</span> 0.65–0.74</span>
                      <span><span className="text-red-400">●</span> &lt; 0.65</span>
                      <span className="ml-auto">KV cache · {history.length} pts</span>
                    </div>
                  </div>
                );
              })()}
            </div>
            {/* Metric tiles */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Integrity', value: gi?.toFixed(3), sub: snapshot.promotionAgeMinutes != null ? `promotion ${snapshot.promotionAgeMinutes}m ago` : 'delta unavailable' },
                { label: 'Signals',  value: String(epicon.length), sub: 'active feeds this cycle' },
                { label: 'Tripwires', value: degradedLanes.length > 0 ? String(degradedLanes.length) : 'CLEAR', sub: `${degradedLanes.length} degraded lane(s)` },
              ].map(m => (
                <div key={m.label} className="rounded border border-slate-800 bg-slate-950/60 px-3 py-2">
                  <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-slate-500">{m.label}</p>
                  <p className="mt-1 font-mono text-lg text-slate-200">{m.value ?? '—'}</p>
                  <p className="font-mono text-[8px] text-slate-600">{m.sub}</p>
                </div>
              ))}
            </div>
            {/* Cycle synthesis */}
            <div className="rounded border border-slate-800 bg-slate-950/60 px-3 py-2">
              <p className="mb-1 font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">Cycle synthesis</p>
              <p className="font-mono text-[11px] leading-relaxed text-slate-300">
                {cycle}: GI {gi?.toFixed(2) ?? '—'}.{' '}
                {degradedLanes.length > 0 ? `${degradedLanes.length} lane(s) degraded/offline.` : 'All lanes nominal.'}{' '}
                {snapshot.systemStatus === 'degraded'
                  ? 'Sentinels should bias to verification and tighter promotion gates.'
                  : 'System operating normally.'}
              </p>
            </div>
            {/* DVA tier routing */}
            <div className="rounded border border-slate-800 bg-slate-950/60 px-3 py-2">
              <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">DVA tier · chamber routing</p>
              {[
                { tier: 'T1', label: 'Substrate', agents: 'ECHO → Globe · Ledger · Pulse' },
                { tier: 'T2', label: 'Sentinel',  agents: 'ATLAS + ZEUS → Journal · EPICON' },
                { tier: 'T3', label: 'Stabilizers', agents: 'EVE + JADE + HERMES → KV Flow · Substrate Sync' },
                { tier: 'Arch', label: 'Architects', agents: 'AUREA + DAEDALUS → Pulse synthesis · Lane Diagnostics' },
              ].map(r => (
                <div key={r.tier} className="flex gap-2 border-t border-white/[0.04] py-1 first:border-0">
                  <span className="w-8 shrink-0 font-mono text-[9px] text-cyan-400/70">{r.tier}</span>
                  <span className="shrink-0 font-mono text-[9px] text-slate-500">{r.label}</span>
                  <span className="font-mono text-[9px] text-slate-400">{r.agents}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* SIGNALS ──────────────────────────────────────────── */}
        {tab === 'signals' && (
          <div className="divide-y divide-white/[0.04] pb-8">
            <div className="sticky top-0 z-10 border-b border-white/[0.06] bg-[#020408]/95 px-3 py-1.5 backdrop-blur-sm">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-400">EPICON feed</span>
                <span className="font-mono text-[9px] text-slate-600">{loading ? 'syncing…' : `${epicon.length} events`}</span>
              </div>
            </div>
            {epicon.length === 0 && !loading && (
              <p className="px-3 py-4 font-mono text-[10px] text-slate-600">No EPICON events in current sweep</p>
            )}
            {epicon.map((ev, i) => {
              const conf = ev.confidence ?? 0;
              const confColor = conf >= 0.9 ? 'text-emerald-400 border-emerald-700/50 bg-emerald-900/20' : conf >= 0.7 ? 'text-amber-400 border-amber-700/50 bg-amber-900/20' : 'text-slate-500 border-slate-700 bg-slate-900/40';
              return (
                <div key={ev.event_id ?? i} className="grid grid-cols-[auto_1fr_auto] items-start gap-x-2 px-3 py-2 hover:bg-white/[0.02]">
                  <span className={`mt-0.5 shrink-0 rounded border px-1 font-mono text-[8px] uppercase ${confColor}`}>{(conf * 100).toFixed(0)}%</span>
                  <div className="min-w-0">
                    <p className="truncate font-mono text-[11px] text-slate-200">{ev.title ?? ev.summary ?? ev.event_id}</p>
                    {ev.tags && ev.tags.length > 0 && <p className="mt-0.5 truncate font-mono text-[9px] text-slate-600">{ev.tags.join(' · ')}</p>}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-mono text-[9px] text-slate-500">{ev.agent ?? '—'}</p>
                    {ev.attested_at && <p className="font-mono text-[9px] text-slate-700">{fmtAge(ev.attested_at)}</p>}
                    {ev.severity && <p className={`font-mono text-[8px] uppercase ${ev.severity === 'high' ? 'text-red-400' : ev.severity === 'medium' ? 'text-amber-400' : 'text-slate-500'}`}>{ev.severity}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {/* TRIPWIRES ─────────────────────────────────────────── */}
        {tab === 'tripwires' && (
          <div className="space-y-3 p-3">
            <div className={`rounded border px-3 py-2 ${degradedLanes.length > 0 ? 'border-amber-700/50 bg-amber-950/20' : 'border-emerald-700/50 bg-emerald-950/20'}`}>
              <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">Tripwire posture</p>
              <p className={`mt-1 font-mono text-lg ${degradedLanes.length > 0 ? 'text-amber-300' : 'text-emerald-300'}`}>
                {degradedLanes.length > 0 ? `${degradedLanes.length} degraded` : 'CLEAR'}
              </p>
            </div>
            {/* Lane grid */}
            <div className="rounded border border-slate-800 bg-slate-950/60 px-3 py-2">
              <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">Lane diagnostics</p>
              <div className="space-y-1">
                {laneDiagArr.map(lane => (
                  <div key={lane.name} className="flex items-center justify-between rounded bg-slate-900/60 px-2 py-1">
                    <span className="font-mono text-[10px] text-slate-300">{lane.name}</span>
                    <span className={`font-mono text-[9px] uppercase ${lane.status === 'ok' ? 'text-emerald-400' : lane.status === 'stale' ? 'text-amber-400' : 'text-red-400'}`}>{lane.status ?? '—'}</span>
                  </div>
                ))}
                {laneDiagArr.length === 0 && <p className="font-mono text-[10px] text-slate-600">No lane data</p>}
              </div>
            </div>
            {/* Posture recommendations */}
            <div className="rounded border border-slate-800 bg-slate-950/60 px-3 py-2">
              <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">Sentinel recommendations</p>
              {[
                'Hold broad promotion until GI and tripwire posture improve',
                'Continue monitoring',
                'Escalate contested EPICONs for explicit ATLAS review',
                'Tighten promotion gates until GI stabilizes',
              ].map(r => (
                <p key={r} className="border-t border-white/[0.04] py-1 font-mono text-[10px] text-slate-400 first:border-0">▸ {r}</p>
              ))}
            </div>
          </div>
        )}
        {/* VAULT ──────────────────────────────────────────────── */}
        {tab === 'vault' && (
          <div className="space-y-3 p-3">
            <div className="rounded border border-slate-800 bg-slate-950/60 px-3 py-2">
              <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">MIC · vault resource</p>
              <div className="space-y-1 font-mono text-[10px]">
                {[
                  { label: 'MIC provisioned', value: vaultStatus.mic?.provisioned?.toFixed(4) ?? '—' },
                  { label: 'MIC minted',      value: vaultStatus.mic?.minted?.toFixed(4) ?? '—' },
                  { label: 'Reserve',         value: vaultStatus.reserve != null ? vaultStatus.reserve.toFixed(2) : '—' },
                  { label: 'Sustain',         value: vaultStatus.sustain != null ? `${vaultStatus.sustain}/5` : '—' },
                  { label: 'Unlock condition', value: vaultStatus.unlockCondition ?? 'GI ≥ 0.95' },
                  { label: 'Status',          value: (gi ?? 0) >= 0.95 ? 'UNLOCKED' : 'LOCKED' },
                  { label: 'Treasury lane',   value: vaultStatus.treasuryLane ?? 'operational' },
                  { label: 'GI source',       value: 'LIVE (live-compute)' },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between border-t border-white/[0.04] py-1 first:border-0">
                    <span className="text-slate-500">{label}</span>
                    <span className="text-slate-200">{value}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded border border-slate-800 bg-slate-950/60 px-3 py-2">
              <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">Seals</p>
              {(vaultStatus.seals ?? []).slice(0, 10).map(s => (
                <div key={s.sealId} className="flex items-center justify-between border-t border-white/[0.04] py-1 first:border-0">
                  <span className="font-mono text-[9px] text-slate-400">{s.sealId}</span>
                  <span className={`font-mono text-[9px] uppercase ${s.status === 'promoted' ? 'text-emerald-400' : s.status === 'quarantined' ? 'text-red-400' : 'text-amber-400'}`}>{s.status}</span>
                </div>
              ))}
              {!vaultStatus.seals?.length && <p className="font-mono text-[10px] text-slate-600">No seal data</p>}
            </div>
          </div>
        )}
        {/* AGENTS ──────────────────────────────────────────────── */}
        {tab === 'agents' && (
          <div className="space-y-1 p-3">
            {agentJournal.length === 0 && <p className="font-mono text-[10px] text-slate-600 py-2">No agent journal entries</p>}
            {agentJournal.slice(0, 20).map((e, i) => (
              <div key={e.id ?? i} className="rounded border border-slate-800 bg-slate-950/60 px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[9px] uppercase tracking-wide text-cyan-400">{e.agent ?? 'SYSTEM'}</span>
                  <span className="font-mono text-[8px] text-slate-600">{e.cycle ?? cycle} · {e.ts ? fmtAge(e.ts) : '—'}</span>
                </div>
                <p className="mt-0.5 font-mono text-[10px] text-slate-300">{e.message ?? e.summary ?? '—'}</p>
              </div>
            ))}
          </div>
        )}
        {/* LEDGER ──────────────────────────────────────────────── */}
        {tab === 'ledger' && (
          <div className="divide-y divide-white/[0.04] pb-8">
            <div className="sticky top-0 z-10 border-b border-white/[0.06] bg-[#020408]/95 px-3 py-1.5 backdrop-blur-sm">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-400">Ledger timeline · {epicon.length} entries</span>
            </div>
            {epicon.map((ev, i) => (
              <div key={ev.event_id ?? i} className="px-3 py-2 hover:bg-white/[0.02]">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-[10px] text-slate-200">{ev.title ?? ev.summary ?? ev.event_id}</p>
                    <p className="font-mono text-[9px] text-slate-500">
                      {ev.attested_at ? new Date(ev.attested_at).toISOString() : '—'} · {ev.agent ?? 'SYSTEM'}
                    </p>
                    <p className="font-mono text-[8px] text-slate-700">Hash/attestation: pending in this stream</p>
                  </div>
                  <span className={`shrink-0 rounded border px-1 font-mono text-[8px] uppercase ${
                    ev.severity === 'high' ? 'border-red-700/50 text-red-400' :
                    ev.tags?.includes('source:heartbeat') ? 'border-cyan-700/50 text-cyan-400' :
                    'border-slate-700 text-slate-500'
                  }`}>
                    {ev.tags?.find(t => t.startsWith('type:'))?.replace('type:', '') ?? ev.severity ?? 'OTHER'}
                  </span>
                </div>
              </div>
            ))}
            {epicon.length === 0 && <p className="px-3 py-4 font-mono text-[10px] text-slate-600">No ledger entries</p>}
          </div>
        )}
        {/* BROWSER — data browser / search ──────────────────── */}
        {tab === 'browser' && (
          <div className="divide-y divide-white/[0.04] pb-8">
            <div className="sticky top-0 z-10 border-b border-white/[0.06] bg-[#020408]/95 px-3 py-1.5 backdrop-blur-sm">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-400">
                  {search.loading ? 'Searching…' : search.query ? `${search.count} results · ${search.query}` : 'KV data browser'}
                </span>
                {search.queryType && <span className="font-mono text-[9px] text-slate-600 capitalize">{search.queryType}</span>}
              </div>
            </div>
            {!search.query && (
              <p className="px-3 py-4 font-mono text-[10px] text-slate-600">
                Type a query above — cycle ID, agent name, seal ID, tag, or any event text. Press Enter to search all KV records.
              </p>
            )}
            {search.error && <p className="px-3 py-3 font-mono text-[10px] text-red-400">{search.error}</p>}
            {!search.loading && search.query && search.results.length === 0 && !search.error && (
              <p className="px-3 py-4 font-mono text-[10px] text-slate-600">
                No records found for <span className="text-slate-400">{search.query}</span>
              </p>
            )}
            {search.results.map((r, i) => {
              const ts = r.attested_at ?? r.writtenAt;
              const sourceColor = r.source === 'ledger' ? 'text-cyan-500' : r.source === 'journal' ? 'text-violet-400' : r.source === 'vault' ? 'text-amber-400' : 'text-slate-500';
              const conf = r.confidence as number | undefined;
              return (
                <div key={r.event_id ?? r.sealId ?? i} className="grid grid-cols-[auto_1fr_auto] items-start gap-x-2 px-3 py-2 hover:bg-white/[0.02]">
                  <span className={`mt-0.5 shrink-0 font-mono text-[8px] uppercase ${sourceColor}`}>
                    {r.source === 'epicon-cache' ? 'epicon' : r.source}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-mono text-[11px] text-slate-200">
                      {r.title ?? r.summary ?? r.message ?? r.event_id ?? r.sealId ?? '—'}
                    </p>
                    <p className="mt-0.5 font-mono text-[9px] text-slate-600">
                      {[r.cycle, r.agent, r.status].filter(Boolean).join(' · ')}
                      {r.tags && (r.tags as string[]).length > 0 && ` · ${(r.tags as string[]).join(' ')}`}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    {conf != null && (
                      <p className={`font-mono text-[9px] ${conf >= 0.9 ? 'text-emerald-400' : conf >= 0.7 ? 'text-amber-400' : 'text-slate-500'}`}>
                        {(conf * 100).toFixed(0)}%
                      </p>
                    )}
                    {ts && <p className="font-mono text-[9px] text-slate-700">{fmtAge(Number(ts))}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
