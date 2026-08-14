export type TrackRExecutiveStatus =
  | 'PASS'
  | 'READY_FOR_ZEUS_EVE_REVIEW'
  | 'CLARIFY'
  | 'QUARANTINE'
  | 'BLOCKED'
  | 'BLOCKED_AUTHENTICATED_LIVE_WITNESS_UNAVAILABLE';

/** Machine exit code — artifact generation must not override this policy. */
export function resolveTrackRProcessExitCode(status: TrackRExecutiveStatus): number {
  switch (status) {
    case 'PASS':
    case 'CLARIFY':
    case 'READY_FOR_ZEUS_EVE_REVIEW':
      return 0;
    case 'QUARANTINE':
    case 'BLOCKED':
    case 'BLOCKED_AUTHENTICATED_LIVE_WITNESS_UNAVAILABLE':
      return 1;
    default: {
      const _exhaustive: never = status;
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
