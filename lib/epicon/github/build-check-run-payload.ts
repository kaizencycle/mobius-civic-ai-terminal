import type { EpiconGithubCheckSummary } from '@/lib/epicon/runtime/types';

type GithubCheckRunConclusion = 'success' | 'neutral' | 'failure';

export type EpiconGithubCheckRunPayload = {
  name: 'EPICON Merge Guard';
  head_sha: string;
  status: 'completed';
  conclusion: GithubCheckRunConclusion;
  output: {
    title: string;
    summary: string;
  };
};

function conclusionFromSummary(
  summary: EpiconGithubCheckSummary,
): GithubCheckRunConclusion {
  if (summary.status === 'failure') return 'failure';
  if (summary.status === 'neutral') return 'neutral';
  return 'success';
}

export function buildCheckRunPayload({
  headSha,
  summary,
}: {
  headSha: string;
  summary: EpiconGithubCheckSummary;
}): EpiconGithubCheckRunPayload {
  return {
    name: 'EPICON Merge Guard',
    head_sha: headSha,
    status: 'completed',
    conclusion: conclusionFromSummary(summary),
    output: {
      title: summary.title,
      summary: summary.summary,
    },
  };
}
