'use client';

import { HashBadge } from '@/components/mic/HashBadge';

export function ChainIntegrityCard({
  hash,
  previousHash,
  algorithm = 'sha256',
}: {
  hash?: string | null;
  previousHash?: string | null;
  algorithm?: string;
}) {
  const status = hash ? 'Present' : 'Missing';

  return (
    <div className="rounded-xl border border-slate-700/80 bg-slate-950/70 p-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Chain integrity</h3>
      <div className="mt-2 space-y-2 font-mono text-[11px] text-slate-300">
        <div>Algorithm: {algorithm}</div>
        <div>Status: {status}</div>
        <HashBadge label="Hash" hash={hash} />
        <HashBadge label="Previous" hash={previousHash} />
      </div>
    </div>
  );
}
