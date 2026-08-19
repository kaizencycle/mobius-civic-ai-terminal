import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getOperatorSession } from '@/lib/auth/session';
import { brokerListPackets } from '@/lib/evidence/brokerClient';
import { EvidencePacketListView } from '@/components/epicon/evidence/EvidencePacketViews';
import { chamberMeta } from '../../layout';

export const metadata = chamberMeta(
  'EPICON · Evidence Packets',
  'Evidence Commons packet list — provenance, freshness, and reuse lineage.',
  'epicon/evidence',
);

export default async function EvidencePacketListPage() {
  const session = await getOperatorSession();
  if (!session) {
    redirect('/api/auth/signin?callbackUrl=/terminal/epicon/evidence');
  }

  const initial = await brokerListPackets(100);

  return (
    <div className="h-full overflow-y-auto p-4 font-mono text-xs text-slate-200">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Evidence Commons · C-408</div>
          <h1 className="mt-1 text-lg font-semibold uppercase tracking-[0.16em] text-fuchsia-200">
            Evidence Packets
          </h1>
          <p className="mt-2 max-w-2xl text-[11px] leading-relaxed text-slate-500">
            Acquired source material with provenance and reuse lineage. Observations remain separate from agent inferences.
          </p>
        </div>
        <Link
          href="/terminal/epicon"
          className="rounded border border-slate-700 px-3 py-1 text-[10px] uppercase tracking-widest text-slate-400 hover:text-slate-200"
        >
          ← EPICON Chamber
        </Link>
      </div>
      <EvidencePacketListView initial={initial} />
    </div>
  );
}
