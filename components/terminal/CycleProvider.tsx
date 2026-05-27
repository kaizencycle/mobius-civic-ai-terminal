'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { computeCurrentCycleId } from '@/lib/terminal/cycle';

const CycleCtx = createContext<string>('C-—');

export function CycleProvider({
  initialCycle,
  children,
}: {
  initialCycle: string;
  children: ReactNode;
}) {
  const [cycle, setCycle] = useState(initialCycle);

  useEffect(() => {
    const update = () => setCycle(computeCurrentCycleId());
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, []);

  return <CycleCtx.Provider value={cycle}>{children}</CycleCtx.Provider>;
}

export function useCycle(): string {
  return useContext(CycleCtx);
}
