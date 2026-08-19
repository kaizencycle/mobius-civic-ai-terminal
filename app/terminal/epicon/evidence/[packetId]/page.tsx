import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getOperatorSession } from '@/lib/auth/session';
import { brokerGetPacketWithPayload } from '@/lib/evidence/brokerClient';
import { operatorRequesterAgent } from '@/lib/evidence/operatorContext';
import { EvidencePacketDetailView } from '@/components/epicon/evidence/EvidencePacketViews';
import { AcquisitionBadge, FreshnessBadge } from '@/components/epicon/evidence/EvidenceBadges';
import { chamberMeta } from '../../../layout';

type PageProps = { params: Promise<{ packetId: string }> };

export async function generateMetadata({ params }: PageProps) {
  const { packetId } = await params;
  return chamberMeta(
    `Evidence · ${packetId}`,
    'Evidence Packet detail — observation, provenance, acquisition, reuse.',
    `epicon/evidence/${packetId}`,
  );
}

export default async function EvidencePacketDetailPage({ params }: PageProps) {
  const session = await getOperatorSession();
  if (!session) {
    redirect('/api/auth/signin?callbackUrl=/terminal/epicon/evidence');
  }

  const { packetId } = await params;
  const detail = await brokerGetPacketWithPayload(packetId, {
    requesterAgent: operatorRequesterAgent(session),
    purpose: 'epicon_evidence_detail',
  });

  return (
    <div className="h-full overflow-y-auto p-4 font-mono text-xs text-slate-200">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link
          href="/terminal/epicon/evidence"
          className="rounded border border-slate-700 px-3 py-1 text-[10px] uppercase tracking-widest text-slate-400 hover:text-slate-200"
        >
          ← All packets
        </Link>
        {detail.packet ? (
          <>
            <FreshnessBadge status={detail.packet.freshness.status} />
            <AcquisitionBadge packet={detail.packet} />
          </>
        ) : null}
      </div>
      <h1 className="mb-4 text-sm font-semibold text-fuchsia-200">{packetId}</h1>
      <EvidencePacketDetailView detail={detail} />
    </div>
  );
}
