import { NextRequest, NextResponse } from 'next/server';

import { normalizeGithubPullRequestWebhook, isSupportedPullRequestAction } from '@/lib/epicon/github/normalize-webhook-pr';
import { verifyGithubWebhookSignature } from '@/lib/epicon/github/verify-signature';
import { buildGithubCheckSummary } from '@/lib/epicon/runtime/build-github-check-summary';
import { buildGovernanceReceipt } from '@/lib/epicon/runtime/build-governance-receipt';
import { evaluatePrRisk } from '@/lib/epicon/runtime/evaluate-pr-risk';

export const dynamic = 'force-dynamic';

type GithubWebhookHeaders = {
  event: string | null;
  delivery: string | null;
  signature: string | null;
};

function readGithubHeaders(request: NextRequest): GithubWebhookHeaders {
  return {
    event: request.headers.get('x-github-event'),
    delivery: request.headers.get('x-github-delivery'),
    signature: request.headers.get('x-hub-signature-256'),
  };
}

function getSensitivePaths(changedFilenames: string[]): string[] {
  const sensitiveTokens = ['auth', 'secret', 'secrets', 'env', 'middleware', 'migration', 'migrations', 'database', 'db'];

  return changedFilenames.filter((filename) => {
    const normalized = filename.toLowerCase();
    return sensitiveTokens.some((token) => normalized.includes(token));
  });
}

function isDocsOnly(changedFilenames: string[]): boolean {
  if (changedFilenames.length === 0) return false;

  return changedFilenames.every((filename) => {
    const normalized = filename.toLowerCase();
    return normalized.endsWith('.md') || normalized.startsWith('docs/');
  });
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const headers = readGithubHeaders(request);

  const verified = verifyGithubWebhookSignature({
    body,
    signature: headers.signature,
    secret: process.env.GITHUB_WEBHOOK_SECRET,
  });

  if (!verified) {
    return NextResponse.json(
      { ok: false, error: 'invalid_github_webhook_signature' },
      { status: 401 },
    );
  }

  if (headers.event !== 'pull_request') {
    return NextResponse.json({
      ok: true,
      ignored: true,
      reason: 'unsupported_github_event',
      event: headers.event,
      delivery: headers.delivery,
    });
  }

  const payload = JSON.parse(body);
  const { action, event } = normalizeGithubPullRequestWebhook(payload);

  if (!isSupportedPullRequestAction(action)) {
    return NextResponse.json({
      ok: true,
      ignored: true,
      reason: 'unsupported_pull_request_action',
      action,
      delivery: headers.delivery,
    });
  }

  const evaluation = evaluatePrRisk({
    filesChanged: event.changedFiles,
    additions: event.additions,
    deletions: event.deletions,
    sensitivePaths: getSensitivePaths(event.changedFilenames),
    replaySignals: 0,
    scopeMismatch: !event.body.includes('Intent:'),
    docsOnly: isDocsOnly(event.changedFilenames),
  });

  const receipt = buildGovernanceReceipt(event, evaluation);
  const check = buildGithubCheckSummary(receipt);

  return NextResponse.json({
    ok: true,
    mode: 'preview',
    enforcement: 'disabled',
    delivery: headers.delivery,
    action,
    event,
    evaluation,
    receipt,
    check,
  });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'EPICON GitHub webhook scaffold',
    mode: 'preview',
    enforcement: 'disabled',
  });
}
