'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { useShellSnapshotState } from '@/hooks/useShellSnapshot';

export type ShellSnapshotContextValue = ReturnType<typeof useShellSnapshotState>;

const ShellSnapshotContext = createContext<ShellSnapshotContextValue | null>(null);

/** Single subscriber for `/api/terminal/shell` — avoids duplicate 30s polling (header + footer + journal). */
export function ShellSnapshotProvider({ children }: { children: ReactNode }) {
  const value = useShellSnapshotState();
  return <ShellSnapshotContext.Provider value={value}>{children}</ShellSnapshotContext.Provider>;
}

export function useShellSnapshot(): ShellSnapshotContextValue {
  const ctx = useContext(ShellSnapshotContext);
  if (!ctx) {
    throw new Error('useShellSnapshot must be used within ShellSnapshotProvider');
  }
  return ctx;
}
