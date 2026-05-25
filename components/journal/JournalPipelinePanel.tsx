'use client';

import DataflowCommandSpine from '@/components/terminal/DataflowCommandSpine';
import { useShellSnapshot } from '@/components/terminal/ShellSnapshotProvider';
import { useLaneDiagnosticsChamber } from '@/hooks/useLaneDiagnosticsChamber';

/** Compact pipeline readout for the Journal chamber footer (C-314). */
export function JournalPipelinePanel() {
  const { shell } = useShellSnapshot();
  const laneDiagnostics = useLaneDiagnosticsChamber(true);
  return <DataflowCommandSpine shell={shell} diagnostics={laneDiagnostics.data} visible compact />;
}
