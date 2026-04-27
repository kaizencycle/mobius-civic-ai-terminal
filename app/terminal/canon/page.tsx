'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { CanonResponse, CanonReserveBlockView, CanonTimelineEvent } from '@/lib/substrate/canon';

type LoadState = 'loading' | 'ready' | 'empty' | 'error';

function shortHash(hash?: string | null, head = 12, tail = 8): string {
  if (!hash) return '—';
  if (hash.length <= head + tail + 1) return hash;
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}

function formatTime(value?: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function stateClass(state: CanonReserveBlockView['attestation_state']): string {
  switch (state) {
    case 'complete':
      return 'border-emerald-500/30 bg-emerald-950/20 text-emerald-200';
    case 'partial':
      return 'border-amber-500/30 bg-amber-950/20 text-amber-200';
    default:
      return 'border-rose-500/30 bg-rose-950/20 text-rose-200';
  }
}

function severityClass(severity: CanonTimelineEvent['severity']): string {
  switch (severity) {
    case 'proof':
      return 'text-cyan-300';
    case 'incident':
      return 'text-rose-300';
    case 'watch':
      return 'text-amber-300';
    default:
      return 'text-slate-400';
  }
}

function BlockInspector({ block }: { block: CanonReserveBlockView }) {
  return (
    <article className="rounded border border-violet-500/25 bg-slate-950/80 p-4 shadow-lg shadow-black/20">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Reserve Block</div>
          <h2 className="mt-1 text-sm font-semibold uppercase tracking-[0.14em] text-cyan-200">Block {block.block_number}</h2>
          <div className="mt-1 text-[10px] text-slate-500">{block.amount} MIC · {block.cycle_at_seal} · GI {block.gi_at_seal.toFixed(2)} · mode {block.mode_at_seal}</div>
        </div>
        <div className={`rounded border px-2 py-1 text-[10px] uppercase tracking-[0.16em] ${stateClass(block.attestation_state)}`}>
          {block.attestation_state}
        </div>
      </div>

      <div className="grid gap-2 text-[10px] text-slate-400 md:grid-cols-2">
        <div className="rounded border border-slate-800/80 bg-slate-950/70 p-2">
          <div className="text-slate-500">seal_id</div>
          <div className="break-all text-slate-200">{block.seal_id}</div>
        </div>
        <div className="rounded border border-slate-800/80 bg-slate-950/70 p-2">
          <div className="text-slate-500">sealed_at</div>
          <div className="text-slate-200">{formatTime(block.sealed_at)}</div>
        </div>
        <div className="rounded border border-slate-800/80 bg-slate-950/70 p-2">
          <div className="text-slate-500">seal_hash</div>
          <div className="break-all text-violet-200" title={block.seal_hash}>{shortHash(block.seal_hash, 18, 10)}</div>
        </div>
        <div className="rounded border border-slate-800/80 bg-slate-950/70 p-2">
          <div className="text-slate-500">previous_seal_hash</div>
          <div className="break-all text-violet-200" title={block.previous_seal_hash ?? undefined}>{shortHash(block.previous_seal_hash, 18, 10)}</div>
        </div>
      </div>

      <div className="mt-3 grid gap-2 text-[10px] text-slate-400 md:grid-cols-4">
        <div>status: <span className="text-slate-100">{block.status}</span></div>
        <div>fountain: <span className="text-amber-200">{block.fountain_status}</span></div>
        <div>entries: <span className="text-slate-100">{block.source_entries}</span></div>
        <div>deposits: <span className="text-slate-100">{block.deposit_hashes_count}</span></div>
      </div>

      <div className="mt-4 rounded border border-slate-800/80 bg-slate-950/60 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Sentinel signatures</div>
          <div className="text-[10px] text-slate-500">missing: {block.missing_agents.length ? block.missing_agents.join(', ') : 'none'}</div>
        </div>
        <div className="space-y-1.5">
          {block.attestations.map((a) => (
            <div key={a.agent} className="grid gap-2 border-b border-slate-800/70 py-1.5 last:border-0 sm:grid-cols-[80px_80px_1fr_1fr]">
              <span className="text-cyan-200">{a.agent}</span>
              <span className={a.signed ? 'text-emerald-300' : 'text-rose-300'}>{a.signed ? a.verdict : 'missing'}</span>
              <span className="text-slate-500">signed_at: <span className="text-slate-300">{formatTime(a.signed_at)}</span></span>
              <span className="truncate text-slate-500" title={a.signature_hash ?? undefined}>sig: <span className="text-violet-200">{a.signature_short ?? '—'}</span>{a.historical ? <span className="ml-2 text-amber-300">historical</span> : null}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded border border-cyan-900/40 bg-cyan-950/10 p-3 text-[10px] text-slate-400">
        <div className="mb-1 uppercase tracking-[0.18em] text-cyan-300/80">Substrate pointer</div>
        <div>attestation_id: <span className="text-cyan-100">{block.substrate_pointer.attestation_id ?? '—'}</span></div>
        <div>event_hash: <span className="text-cyan-100" title={block.substrate_pointer.event_hash ?? undefined}>{shortHash(block.substrate_pointer.event_hash, 18, 10)}</span></div>
        <div>attested_at: <span className="text-cyan-100">{formatTime(block.substrate_pointer.attested_at)}</span></div>
        {block.substrate_pointer.error ? <div className="mt-1 text-rose-300">error: {block.substrate_pointer.error}</div> : null}
      </div>
    </article>
  );
}

function Timeline({ events }: { events: CanonTimelineEvent[] }) {
  if (events.length === 0) return <div className="rounded border border-slate-800 bg-slate-950/70 p-3 text-[11px] text-slate-500">No canon timeline events yet.</div>;
  return (
    <div className="rounded border border-slate-800 bg-slate-950/70 p-3">
      <div className="mb-3 text-[10px] uppercase tracking-[0.2em] text-violet-300/80">Canon timeline</div>
      <div className="space-y-2">
        {events.map((event) => (
          <div key={event.id} className="grid gap-2 border-b border-slate-800/70 pb-2 last:border-0 sm:grid-cols-[110px_1fr]">
            <div className="text-[10px] text-slate-500">{formatTime(event.timestamp)}</div>
            <div>
              <div className={`text-[11px] uppercase tracking-[0.14em] ${severityClass(event.severity)}`}>{event.title}</div>
              <div className="mt-0.5 text-[10px] text-slate-500">{event.type} · {event.cycle ?? 'cycle —'}{event.seal_id ? ` · ${event.seal_id}` : ''}</div>
              <div className="mt-1 text-[11px] text-slate-300">{event.summary}</div>
              {event.hash ? <div className="mt-1 text-[10px] text-violet-300" title={event.hash}>hash: {shortHash(event.hash, 18, 10)}</div> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CanonPage() {
  const [data, setData] = useState<CanonResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const state: LoadState = err ? 'error' : data ? (data.reserve_blocks.length ? 'ready' : 'empty') : 'loading';

  useEffect(() => {
    void fetch('/api/substrate/canon?type=reserve_blocks', { cache: 'no-store' })
      .then(async (r) => {
        const j = (await r.json()) as CanonResponse;
        if (!r.ok) throw new Error('canon_fetch_failed');
        setData(j);
      })
      .catch(() => setErr('Failed to load canon'));
  }, []);

  const completeBlocks = useMemo(() => data?.reserve_blocks.filter((b) => b.attestation_state === 'complete').length ?? 0, [data]);
  const partialBlocks = useMemo(() => data?.reserve_blocks.filter((b) => b.attestation_state === 'partial').length ?? 0, [data]);
  const missingBlocks = useMemo(() => data?.reserve_blocks.filter((b) => b.attestation_state === 'missing').length ?? 0, [data]);

  if (state === 'error') return <div className="p-4 text-sm text-rose-300">{err}</div>;
  if (state === 'loading') return <div className="p-4 text-sm text-slate-400">Loading canon…</div>;
  if (!data) return null;

  return (
    <div className="h-full overflow-y-auto p-4 font-mono text-xs text-slate-200">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Mobius Substrate</div>
          <h1 className="mt-1 text-sm font-semibold uppercase tracking-[0.16em] text-violet-200">Canon Browser</h1>
          <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-slate-500">Read-only inspection layer for Reserve Blocks, historical Sentinel attestations, substrate pointers, and incident-grade proof events.</p>
        </div>
        <div className="flex gap-2 text-[10px]">
          <Link href="/terminal/vault" className="rounded border border-slate-700 px-2 py-1 text-slate-400 hover:border-cyan-500/50 hover:text-cyan-300">← Vault</Link>
          <Link href="/terminal/sentinel" className="rounded border border-slate-700 px-2 py-1 text-slate-400 hover:border-violet-500/50 hover:text-violet-300">Sentinel</Link>
        </div>
      </div>

      <div className="mb-4 rounded border border-emerald-500/25 bg-slate-950/90 p-3 text-[11px] text-emerald-50/90">
        <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-400/90">Canon law · Phase 8</div>
        <div className="mt-1 grid gap-1 text-[10px] text-slate-400 md:grid-cols-2">
          {data.canon.map((rule) => <div key={rule}>• {rule}</div>)}
        </div>
      </div>

      <div className="mb-4 grid gap-2 sm:grid-cols-4">
        <div className="rounded border border-slate-800 bg-slate-950/80 p-3"><div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Blocks</div><div className="mt-1 text-lg text-cyan-200">{data.reserve_blocks.length}</div></div>
        <div className="rounded border border-slate-800 bg-slate-950/80 p-3"><div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Complete</div><div className="mt-1 text-lg text-emerald-300">{completeBlocks}</div></div>
        <div className="rounded border border-slate-800 bg-slate-950/80 p-3"><div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Partial</div><div className="mt-1 text-lg text-amber-300">{partialBlocks}</div></div>
        <div className="rounded border border-slate-800 bg-slate-950/80 p-3"><div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Missing</div><div className="mt-1 text-lg text-rose-300">{missingBlocks}</div></div>
      </div>

      {state === 'empty' ? <div className="rounded border border-slate-800 bg-slate-950/70 p-4 text-slate-500">No Reserve Blocks have been written to canon yet.</div> : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          {data.reserve_blocks.map((block) => <BlockInspector key={block.seal_id} block={block} />)}
        </div>
        <aside className="space-y-4">
          <Timeline events={data.timeline} />
          <div className="rounded border border-slate-800 bg-slate-950/70 p-3 text-[10px] text-slate-500">
            <div className="mb-2 uppercase tracking-[0.2em] text-violet-300/80">Endpoint</div>
            <div>GET /api/substrate/canon</div>
            <div>GET /api/substrate/canon?type=reserve_blocks</div>
            <div>GET /api/substrate/canon?seal_id=&lt;seal_id&gt;</div>
          </div>
        </aside>
      </div>
    </div>
  );
}
