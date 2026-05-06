import crypto from 'node:crypto';

import type {
  EpiconGovernanceReceipt,
  EpiconPullRequestEvent,
  EpiconRuntimeEvaluation,
} from './types';

function buildReplayFingerprint(
  event: EpiconPullRequestEvent,
  evaluation: EpiconRuntimeEvaluation,
): string {
  const payload = JSON.stringify({
    repo: event.repo,
    prNumber: event.prNumber,
    branch: event.branch,
    risk: evaluation.risk,
    severity: evaluation.severity,
    reasons: evaluation.reasons,
  });

  return crypto
    .createHash('sha256')
    .update(payload)
    .digest('hex');
}

export function buildGovernanceReceipt(
  event: EpiconPullRequestEvent,
  evaluation: EpiconRuntimeEvaluation,
): EpiconGovernanceReceipt {
  const verdict =
    evaluation.severity === 'high'
      ? 'quarantine'
      : evaluation.severity === 'medium'
        ? 'clarify'
        : 'pass';

  return {
    verdict,
    risk: evaluation.risk,
    severity: evaluation.severity,
    consensus: null,
    replayFingerprint: buildReplayFingerprint(event, evaluation),
    governanceVersion: 'EPICON-03',
    timestamp: new Date().toISOString(),
    event: {
      repo: event.repo,
      prNumber: event.prNumber,
      branch: event.branch,
      author: event.author,
    },
    reasons: evaluation.reasons,
    enforcement: 'disabled',
  };
}
