import type { ReactNode } from 'react';
import TerminalShell from '@/components/terminal/TerminalShell';

export default function TerminalLayout({ children }: { children: ReactNode }) {
  return <TerminalShell>{children}</TerminalShell>;
}
