'use client';

import type { EvidenceDetailResponse, EvidenceListResponse } from '@/lib/evidence/types';
import { EvidencePacketCard } from '@/components/epicon/evidence/EvidencePacketCard';

export function EvidencePacketListView({
  initial,
}: {
  initial: EvidenceListResponse;
}) {
  if (initial.degraded) {
    return (
      <div className="rounded border border-amber-600/40 bg-amber-950/20 p-4 font-mono text-xs text-amber-200">
        Broker degraded — {initial.error ?? 'unreachable'}. No invented packets rendered.
      </div>
    );
  }

  if (!initial.ok) {
    return (
      <div className="rounded border border-amber-600/40 bg-amber-950/20 p-4 font-mono text-xs text-amber-200">
        Broker error — {initial.error ?? 'request_failed'}. No invented packets rendered.
      </div>
    );
  }

  const packets = initial.packets ?? [];
  if (packets.length === 0) {
    return (
      <div className="rounded border border-slate-800 bg-slate-950/50 p-4 font-mono text-xs text-slate-400">
        No Evidence Packets indexed. Submit HERMES candidates or mock-acquire via Broker.
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {packets.map((packet) => (
        <EvidencePacketCard key={packet.packetId} packet={packet} />
      ))}
    </div>
  );
}

export function EvidencePacketDetailView({ detail }: { detail: EvidenceDetailResponse }) {
  if (detail.degraded) {
    return (
      <div className="rounded border border-amber-600/40 bg-amber-950/20 p-4 font-mono text-xs text-amber-200">
        Broker degraded — {detail.error ?? 'unreachable'}.
      </div>
    );
  }

  if (!detail.ok) {
    return (
      <div className="rounded border border-amber-600/40 bg-amber-950/20 p-4 font-mono text-xs text-amber-200">
        Broker error — {detail.reason ?? detail.error ?? 'request_failed'}.
      </div>
    );
  }

  const packet = detail.packet;
  if (!packet) {
    return (
      <div className="rounded border border-rose-700/40 bg-rose-950/20 p-4 font-mono text-xs text-rose-200">
        Packet not found.
      </div>
    );
  }

  const summary = detail.summary;
  const reuseEvents = detail.reuseEvents ?? [];

  return (
    <div className="space-y-4 font-mono text-xs">
      <section className="rounded border border-slate-800 bg-slate-950/80 p-4">
        <h2 className="text-[10px] uppercase tracking-widest text-fuchsia-300">Observation</h2>
        <p className="mt-2 text-sm text-slate-100">{packet.observation}</p>
        <p className="mt-1 text-[10px] text-slate-500">claim: {packet.claimClass}</p>
      </section>

      <section className="rounded border border-slate-800 bg-slate-950/80 p-4">
        <h2 className="text-[10px] uppercase tracking-widest text-cyan-300">Provenance</h2>
        <dl className="mt-2 grid gap-2 md:grid-cols-2">
          <div><dt className="text-slate-500">provider</dt><dd>{packet.source.providerId}</dd></div>
          <div><dt className="text-slate-500">content hash</dt><dd className="break-all">{packet.contentHash.slice(0, 16)}…</dd></div>
          <div><dt className="text-slate-500">request hash</dt><dd className="break-all">{packet.requestHash.slice(0, 16)}…</dd></div>
          <div><dt className="text-slate-500">normalized query</dt><dd>{packet.normalizedQuery}</dd></div>
        </dl>
      </section>

      <section className="rounded border border-slate-800 bg-slate-950/80 p-4">
        <h2 className="text-[10px] uppercase tracking-widest text-amber-300">Acquisition receipt</h2>
        <dl className="mt-2 grid gap-2 md:grid-cols-2">
          <div><dt className="text-slate-500">agent</dt><dd>{packet.acquisition.acquiredByAgent}</dd></div>
          <div><dt className="text-slate-500">mode</dt><dd>{packet.acquisition.acquisitionMode}</dd></div>
          <div><dt className="text-slate-500">price</dt><dd>{packet.acquisition.price ? `${packet.acquisition.price.amount} ${packet.acquisition.price.currency}` : 'FREE'}</dd></div>
          <div><dt className="text-slate-500">payment ref</dt><dd>{packet.acquisition.paymentReference ?? '—'}</dd></div>
        </dl>
      </section>

      <section className="rounded border border-slate-800 bg-slate-950/80 p-4">
        <h2 className="text-[10px] uppercase tracking-widest text-emerald-300">Freshness & verification</h2>
        <dl className="mt-2 grid gap-2 md:grid-cols-2">
          <div><dt className="text-slate-500">freshness</dt><dd>{packet.freshness.status}</dd></div>
          <div><dt className="text-slate-500">valid until</dt><dd>{packet.freshness.validUntil ?? 'open'}</dd></div>
          <div><dt className="text-slate-500">verification</dt><dd>{packet.verification.status}</dd></div>
          <div><dt className="text-slate-500">independent sources</dt><dd>{summary?.independentSourceCount ?? packet.verification.independentSourceCount}</dd></div>
        </dl>
      </section>

      <section className="rounded border border-slate-800 bg-slate-950/80 p-4">
        <h2 className="text-[10px] uppercase tracking-widest text-violet-300">Reuse lineage</h2>
        <p className="mt-2 text-slate-400">
          readers: {summary?.readerCount ?? '—'} · reuse events: {summary?.reuseCount ?? reuseEvents.length} · total paid:{' '}
          {summary?.totalPaidAmount ? `${summary.totalPaidAmount} ${summary.totalPaidCurrency}` : '—'}
        </p>
        <ul className="mt-2 space-y-1">
          {reuseEvents.map((event) => (
            <li key={event.eventId} className="text-[10px] text-slate-400">
              {event.consumerAgent} · {event.accessMode} · +{event.additionalPayment.amount} {event.additionalPayment.currency} · {event.reusedAt}
            </li>
          ))}
          {reuseEvents.length === 0 ? <li className="text-slate-600">No reuse events yet.</li> : null}
        </ul>
      </section>
    </div>
  );
}
