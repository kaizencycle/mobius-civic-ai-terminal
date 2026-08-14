export type LiveWitnessBlockedReason =
  | 'BLOCKED_AUTHENTICATED_LIVE_WITNESS_UNAVAILABLE'
  | 'BLOCKED_KV_ENVIRONMENT_IDENTITY_MISMATCH'
  | 'BLOCKED_LIVE_WITNESS_INCOMPLETE'
  | 'BLOCKED_LIVE_WITNESS_MISMATCH';

export type TrackRExecutiveStatus =
  | 'PASS'
  | 'READY_FOR_ZEUS_EVE_REVIEW'
  | 'CLARIFY'
  | 'QUARANTINE'
  | 'BLOCKED'
  | 'BLOCKED_PRODUCTION_KV_CREDENTIALS_NOT_CONFIGURED'
  | 'BLOCKED_AUTHENTICATED_LIVE_WITNESS_UNAVAILABLE'
  | 'BLOCKED_KV_ENVIRONMENT_IDENTITY_MISMATCH'
  | 'BLOCKED_LIVE_AFFECTED_BLOCK_SET_UNAVAILABLE'
  | 'BLOCKED_LIVE_WITNESS_INCOMPLETE'
  | 'BLOCKED_LIVE_WITNESS_MISMATCH'
  | 'QUARANTINE_LIVE_COLLISION_UNIVERSE_DRIFT'
  | 'QUARANTINE_LIVE_WITNESS_MISMATCH'
  | 'QUARANTINE_BOUNDARY_41_42_FAILURE';

/** Machine exit code — artifact generation must not override this policy. */
export function resolveTrackRProcessExitCode(status: TrackRExecutiveStatus): number {
  switch (status) {
    case 'PASS':
    case 'CLARIFY':
    case 'READY_FOR_ZEUS_EVE_REVIEW':
      return 0;
    case 'QUARANTINE':
    case 'BLOCKED':
    case 'BLOCKED_PRODUCTION_KV_CREDENTIALS_NOT_CONFIGURED':
    case 'BLOCKED_AUTHENTICATED_LIVE_WITNESS_UNAVAILABLE':
    case 'BLOCKED_KV_ENVIRONMENT_IDENTITY_MISMATCH':
    case 'BLOCKED_LIVE_AFFECTED_BLOCK_SET_UNAVAILABLE':
    case 'BLOCKED_LIVE_WITNESS_INCOMPLETE':
    case 'BLOCKED_LIVE_WITNESS_MISMATCH':
    case 'QUARANTINE_LIVE_COLLISION_UNIVERSE_DRIFT':
    case 'QUARANTINE_LIVE_WITNESS_MISMATCH':
    case 'QUARANTINE_BOUNDARY_41_42_FAILURE':
      return 1;
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function executiveStatusFromLiveWitnessBlockedReason(
  reason: LiveWitnessBlockedReason | null,
): TrackRExecutiveStatus | null {
  if (!reason) return null;
  switch (reason) {
    case 'BLOCKED_AUTHENTICATED_LIVE_WITNESS_UNAVAILABLE':
      return 'BLOCKED_AUTHENTICATED_LIVE_WITNESS_UNAVAILABLE';
    case 'BLOCKED_KV_ENVIRONMENT_IDENTITY_MISMATCH':
      return 'BLOCKED_KV_ENVIRONMENT_IDENTITY_MISMATCH';
    case 'BLOCKED_LIVE_WITNESS_INCOMPLETE':
      return 'BLOCKED_LIVE_WITNESS_INCOMPLETE';
    case 'BLOCKED_LIVE_WITNESS_MISMATCH':
      return 'QUARANTINE_LIVE_WITNESS_MISMATCH';
    default: {
      const _exhaustive: never = reason;
      return _exhaustive;
    }
  }
}

export function isTrackRExecutionAuthorized(status: TrackRExecutiveStatus): boolean {
  return status === 'PASS';
}

export function isTrackREvidenceGenerationSuccessful(status: TrackRExecutiveStatus): boolean {
  return (
    status === 'CLARIFY' ||
    status === 'READY_FOR_ZEUS_EVE_REVIEW' ||
    status === 'PASS'
  );
}
