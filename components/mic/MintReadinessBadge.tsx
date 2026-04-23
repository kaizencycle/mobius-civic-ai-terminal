'use client';

import type { MicMintReadiness } from '@/lib/mic/types';

const LABEL_MAP: Record<MicMintReadiness, string> = {
  not_eligible: 'Not Eligible',
  reserve_only: 'Reserve Only',
  seal_ready: 'Seal Ready',
  quorum_pending: 'Quorum Pending',
  fountain_ready: 'Fountain Ready',
};

export function MintReadinessBadge({ mintReadiness }: { mintReadiness: MicMintReadiness }) {
  return (
    <div className="rounded-md border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-100">
      Mint readiness: {LABEL_MAP[mintReadiness]}
    </div>
  );
}
