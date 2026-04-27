'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { currentCycleId } from '@/lib/eve/cycle-engine';

// (file truncated for brevity — only header updated)

export default function VaultPage() {
  // ...existing code unchanged...

  return (
    <div className="h-full overflow-y-auto p-4 text-slate-200">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-sm font-semibold uppercase tracking-[0.15em] text-violet-200">Vault · Reserve Blocks</h1>
        <div className="flex gap-2 text-[10px] font-mono">
          <Link href="/terminal/canon" className="text-slate-500 hover:text-cyan-300">Canon →</Link>
          <Link href="/terminal/sentinel" className="text-slate-500 hover:text-cyan-300">Sentinel</Link>
        </div>
      </div>

      {/* rest of file unchanged */}
    </div>
  );
}
