import Link from 'next/link';
import type { EvidencePacketListItem } from '@/lib/evidence/types';
import { AcquisitionBadge, FreshnessBadge } from '@/components/epicon/evidence/EvidenceBadges';

export function EvidencePacketCard({ packet }: { packet: EvidencePacketListItem }) {
  const summary = packet.summary;
  return (
    <Link
      href={`/terminal/epicon/evidence/${encodeURIComponent(packet.packetId)}`}
      className="block rounded border border-slate-800 bg-slate-950/80 p-3 hover:border-fuchsia-700/50"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] text-fuchsia-300">{packet.packetId}</span>
        <FreshnessBadge status={packet.freshness.status} />
        <AcquisitionBadge packet={packet} />
      </div>
      <div className="mt-2 text-sm text-slate-100">{packet.subject}</div>
      <p className="mt-1 line-clamp-2 text-[11px] text-slate-400">{packet.observation}</p>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-[10px] font-mono text-slate-500 md:grid-cols-4">
        <div>
          <dt>provider</dt>
          <dd className="text-slate-300">{packet.source.providerId}</dd>
        </div>
        <div>
          <dt>acquired by</dt>
          <dd className="text-slate-300">{packet.acquisition.acquiredByAgent}</dd>
        </div>
        <div>
          <dt>readers</dt>
          <dd className="text-slate-300">{summary?.readerCount ?? '—'}</dd>
        </div>
        <div>
          <dt>independent sources</dt>
          <dd className="text-slate-300">{summary?.independentSourceCount ?? packet.verification.independentSourceCount}</dd>
        </div>
      </dl>
    </Link>
  );
}
