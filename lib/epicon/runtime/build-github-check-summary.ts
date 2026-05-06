import type {
  EpiconGithubCheckSummary,
  EpiconGovernanceReceipt,
} from './types';

function formatReasons(reasons: string[]): string {
  if (reasons.length === 0) return '- no deterministic risk reasons detected';

  return reasons.map((reason) => `- ${reason}`).join('\n');
}

function statusForReceipt(
  receipt: EpiconGovernanceReceipt,
): EpiconGithubCheckSummary['status'] {
  if (receipt.verdict === 'quarantine') return 'failure';
  if (receipt.verdict === 'clarify') return 'neutral';
  return 'success';
}

export function buildGithubCheckSummary(
  receipt: EpiconGovernanceReceipt,
): EpiconGithubCheckSummary {
  const title = `EPICON ${receipt.verdict.toUpperCase()} · risk ${receipt.risk.toFixed(2)}`;

  const summary = [
    '## EPICON Runtime Preview',
    '',
    `**Verdict:** ${receipt.verdict.toUpperCase()}`,
    `**Risk:** ${receipt.risk.toFixed(2)}`,
    `**Severity:** ${receipt.severity}`,
    `**Governance Version:** ${receipt.governanceVersion}`,
    `**Enforcement:** ${receipt.enforcement}`,
    '',
    '### Event',
    `- Repo: ${receipt.event.repo}`,
    `- PR: #${receipt.event.prNumber}`,
    `- Branch: ${receipt.event.branch}`,
    `- Author: ${receipt.event.author}`,
    '',
    '### Deterministic Reasons',
    formatReasons(receipt.reasons),
    '',
    '### Replay Fingerprint',
    `\`${receipt.replayFingerprint}\``,
    '',
    '> EPICON Runtime Preview is observational only. It does not block merges in this phase.',
  ].join('\n');

  return {
    name: 'EPICON Runtime Preview',
    status: statusForReceipt(receipt),
    title,
    summary,
  };
}
