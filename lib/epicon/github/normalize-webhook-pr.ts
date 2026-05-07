import { normalizePullRequestEvent } from '@/lib/epicon/runtime/normalize-pull-request-event';
import type { EpiconPullRequestEvent } from '@/lib/epicon/runtime/types';

type GithubWebhookPullRequestPayload = Parameters<typeof normalizePullRequestEvent>[0] & {
  action?: string;
};

export type EpiconGithubPullRequestWebhook = {
  action: string;
  event: EpiconPullRequestEvent;
};

export function normalizeGithubPullRequestWebhook(
  payload: GithubWebhookPullRequestPayload,
  changedFilenames: string[] = [],
): EpiconGithubPullRequestWebhook {
  return {
    action: payload.action ?? 'unknown',
    event: normalizePullRequestEvent(payload, changedFilenames),
  };
}

export function isSupportedPullRequestAction(action: string): boolean {
  return ['opened', 'synchronize', 'reopened'].includes(action);
}
