import { NextResponse } from 'next/server';

import { buildGovernanceReceipt } from '@/lib/epicon/runtime/build-governance-receipt';
import { buildQuorumDecision } from '@/lib/epicon/quorum/build-quorum-decision';
import { buildQuorumPacket } from '@/lib/epicon/quorum/build-quorum-packet';
import type {
  EpiconPullRequestEvent,
  EpiconRuntimeEvaluation,
} from '@/lib/epicon/runtime/types';

export const dynamic = 'force-dynamic';

const sampleEvent: EpiconPullRequestEvent = {
  repo: 'kaizencycle/mobius-civic-ai-terminal',
  prNumber: 501,
  title: 'feat(c303): add EPICON quorum escalation runtime',
  body: 'Phase 3 preview packet for observational quorum routing.',
  branch: 'c303-phase3-quorum-escalation-runtime',
  author: 'kaizencycle',
  additions: 127,
  deletions: 0,
  changedFiles: 3,
  changedFilenames: [
    'lib/epicon/quorum/types.ts',
    'lib/epicon/quorum/escalation-router.ts',
    'lib/epicon/quorum/build-quorum-packet.ts',
  ],
  timestamp: new Date().toISOString(),
};

const sampleEvaluation: EpiconRuntimeEvaluation = {
  pass: false,
  risk: 0.82,
  severity: 'high',
  recommendedAction: 'quarantine',
  reasons: [
    'high runtime risk preview',
    'sensitive governance path modified',
  ],
  normalized: {
    filesChanged: 3,
    additions: 127,
    deletions: 0,
    sensitivePaths: ['lib/epicon/quorum'],
    replaySignals: 0,
    scopeMismatch: false,
    docsOnly: false,
    totalChanges: 127,
    changeVolume: 'small',
    sensitivePathCount: 1,
  },
  meta: {
    evaluator: 'epicon-runtime-layer-0',
    enforcement: 'disabled',
    deterministic: true,
  },
};

export async function GET() {
  const receipt = buildGovernanceReceipt(sampleEvent, sampleEvaluation);
  const packet = buildQuorumPacket(receipt);
  const decision = buildQuorumDecision(packet);

  return NextResponse.json({
    ok: true,
    phase: 'C-303 Phase 3 — Quorum Escalation Runtime',
    enforcement: 'disabled',
    receipt,
    packet,
    decision,
  });
}
