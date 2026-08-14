import type { AffectedBlockSetComparison } from '@/lib/watchdog/batchRepair/affectedBlockComparison';
import type { Governance131CutoffAssessment } from '@/lib/watchdog/batchRepair/governance131Cutoff';
import type { LiveBoundary4142Assessment } from '@/lib/watchdog/batchRepair/liveBoundaryEvidence';
import type { LiveSealWitnessExportAttempt } from '@/lib/watchdog/batchRepair/liveSealWitnessExport';
import type { ProductionKvIdentityReceipt } from '@/lib/watchdog/batchRepair/productionKvIdentityReceipt';
import {
  executiveStatusFromLiveWitnessBlockedReason,
  type TrackRExecutiveStatus,
} from '@/lib/watchdog/batchRepair/processExitPolicy';

export type DriftItem = { field: string; expected: unknown; observed: unknown; severity: 'info' | 'material' };

export function resolveTrackRExecutiveStatus(args: {
  credentialsConfigured: boolean;
  kvIdentityReceipt: ProductionKvIdentityReceipt | null;
  fetchFailures: string[];
  dryRunOk: boolean;
  materialDrift: DriftItem[];
  affectedBlockComparison: AffectedBlockSetComparison;
  liveWitnessAttempt: LiveSealWitnessExportAttempt;
  governance131: Governance131CutoffAssessment;
  liveBoundary4142: LiveBoundary4142Assessment;
  boundary131Metric: string;
}): TrackRExecutiveStatus {
  if (!args.credentialsConfigured) {
    return 'BLOCKED_PRODUCTION_KV_CREDENTIALS_NOT_CONFIGURED';
  }

  if (
    args.kvIdentityReceipt &&
    args.kvIdentityReceipt.identity_status !== 'PRODUCTION_KV_IDENTITY_CONFIRMED'
  ) {
    return 'BLOCKED_KV_ENVIRONMENT_IDENTITY_MISMATCH';
  }

  if (args.fetchFailures.length > 0) return 'BLOCKED';
  if (!args.dryRunOk) return 'BLOCKED';

  if (!args.affectedBlockComparison.live_block_numbers) {
    return 'BLOCKED_LIVE_AFFECTED_BLOCK_SET_UNAVAILABLE';
  }

  if (
    !args.affectedBlockComparison.set_match &&
    args.affectedBlockComparison.live_block_numbers.length > 0
  ) {
    return 'QUARANTINE_LIVE_COLLISION_UNIVERSE_DRIFT';
  }

  if (!args.affectedBlockComparison.set_match) {
    return 'BLOCKED_LIVE_AFFECTED_BLOCK_SET_UNAVAILABLE';
  }

  if (args.affectedBlockComparison.live_artifact_stale) {
    return 'BLOCKED_LIVE_AFFECTED_BLOCK_SET_UNAVAILABLE';
  }

  if (args.materialDrift.some((d) => d.severity === 'material')) {
    return 'BLOCKED';
  }

  if (args.liveWitnessAttempt.blocked_reason) {
    return (
      executiveStatusFromLiveWitnessBlockedReason(args.liveWitnessAttempt.blocked_reason) ??
      'BLOCKED'
    );
  }

  const exportSummary = args.liveWitnessAttempt.export?.summary;
  if (exportSummary && exportSummary.mismatch > 0) {
    return 'QUARANTINE_LIVE_WITNESS_MISMATCH';
  }

  if (
    args.liveWitnessAttempt.export &&
    (!args.liveWitnessAttempt.ok || args.liveWitnessAttempt.verification_errors.length > 0)
  ) {
    return 'BLOCKED_LIVE_WITNESS_INCOMPLETE';
  }

  if (!args.liveWitnessAttempt.ok) return 'BLOCKED_LIVE_WITNESS_INCOMPLETE';

  if (args.liveBoundary4142.status === 'fail') {
    return 'QUARANTINE_BOUNDARY_41_42_FAILURE';
  }

  if (args.liveBoundary4142.status !== 'pass') {
    return 'QUARANTINE_BOUNDARY_41_42_FAILURE';
  }

  if (args.governance131.status === 'quarantine') return 'QUARANTINE';
  if (args.boundary131Metric === 'pass') return 'QUARANTINE';

  if (
    args.liveWitnessAttempt.ok &&
    args.governance131.ok &&
    args.affectedBlockComparison.set_match &&
    args.liveBoundary4142.ok
  ) {
    return 'READY_FOR_ZEUS_EVE_REVIEW';
  }

  if (!args.governance131.ok) return 'CLARIFY';

  return 'CLARIFY';
}
