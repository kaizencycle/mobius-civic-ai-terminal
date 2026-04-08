'use client';

import MICWalletPanel from '@/components/terminal/MICWalletPanel';
import { useTerminalSnapshot } from '@/hooks/useTerminalSnapshot';

export default function MicPage() {
  const { snapshot } = useTerminalSnapshot();
  const integrity = (snapshot?.integrity?.data ?? {}) as { global_integrity?: number };
  return (
    <div className="h-full overflow-y-auto p-4">
      <MICWalletPanel
        gi={{
          score: Number(integrity.global_integrity ?? 0),
          delta: 0,
          institutionalTrust: 0,
          infoReliability: 0,
          consensusStability: 0,
          weekly: [],
        }}
        integrity={null}
      />
    </div>
  );
}
