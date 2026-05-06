import type { EpiconPullRequestEvent } from './types';

type GithubPullRequestLike = {
  number?: number;
  title?: string | null;
  body?: string | null;
  additions?: number | null;
  deletions?: number | null;
  changed_files?: number | null;
  head?: {
    ref?: string | null;
  } | null;
  user?: {
    login?: string | null;
  } | null;
};

type GithubRepositoryLike = {
  full_name?: string | null;
};

type GithubPullRequestWebhookLike = {
  pull_request?: GithubPullRequestLike | null;
  repository?: GithubRepositoryLike | null;
};

export function normalizePullRequestEvent(
  payload: GithubPullRequestWebhookLike,
  changedFilenames: string[] = [],
  timestamp = new Date().toISOString(),
): EpiconPullRequestEvent {
  const pullRequest = payload.pull_request;
  const repository = payload.repository;

  return {
    repo: repository?.full_name ?? 'unknown/unknown',
    prNumber: pullRequest?.number ?? 0,
    title: pullRequest?.title ?? '',
    body: pullRequest?.body ?? '',
    branch: pullRequest?.head?.ref ?? 'unknown',
    author: pullRequest?.user?.login ?? 'unknown',
    additions: pullRequest?.additions ?? 0,
    deletions: pullRequest?.deletions ?? 0,
    changedFiles: pullRequest?.changed_files ?? changedFilenames.length,
    changedFilenames,
    timestamp,
  };
}
