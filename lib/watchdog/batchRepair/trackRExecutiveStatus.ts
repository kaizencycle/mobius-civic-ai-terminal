import type { AffectedBlockSetComparison } from '@/lib/watchdog/batchRepair/affectedBlockComparison';
import type { Governance131CutoffAssessment } from '@/lib/watchdog/batchRepair/governance131Cutoff';
import type { LiveSealWitnessExportAttempt } from '@/lib/watchdog/batchRepair/liveSealWitnessExport';
import type { TrackRExecutiveStatus } from '@/lib/watchdog/batchRepair/processExitPolicy';

export type DriftItem = { field: string; expected: unknown; observed: unknown; severity: 'info' | 'material' };

export function resolveTrackRExecutiveStatus(args: {
  fetchFailures: string[];
  dryRunOk: boolean;
  materialDrift: DriftItem[];
  affectedBlockComparison: AffectedBlockSetComparison;
  liveWitnessAttempt: LiveSealWitnessExportAttempt;
  governance131: Governance131CutoffAssessment;
  boundary131Metric: string;
}): TrackRExecutiveStatus {
  if (args.fetchFailures.length > 0) return 'BLOCKED';
  if (!args.dryRunOk) return 'BLOCKED';
  if (args.materialDrift.some((d) => d.severity === 'material')) return 'BLOCKED';
  if (!args.affectedBlockComparison.live_artifact_present) return 'BLOCKED';
  if (!args.affectedBlockComparison.set_match) return 'BLOCKED';

  if (args.liveWitnessAttempt.blocked_reason === 'BLOCKED_AUTHENTICATED_LIVE_WITNESS_UNAVAILABLE') {
    return 'BLOCKED_AUTHENTICATED_LIVE_WITNESS_UNAVAILABLE';
  }

  if (args.governance131.status === 'quarantine') return 'QUARANTINE';
  if (args.boundary131Metric === 'pass') return 'QUARANTINE';

  if (
    args.liveWitnessAttempt.ok &&
    args.governance131.ok &&
    args.affectedBlockComparison.set_match
  ) {
    return 'READY_FOR_ZEUS_EVE_REVIEW';
  }

  if (!args.liveWitnessAttempt.ok) return 'CLARIFY';
  if (!args.governance131.ok) return 'CLARIFY';

  return 'CLARIFY';
}
