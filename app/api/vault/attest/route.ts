/**
 * POST /api/vault/attest — C-298 sentinel cycle quorum registration.
 *
 * ZEUS verification and sentinel probes POST { agent, cycle, confidence, source }
 * to record per-cycle quorum eligibility in `mic:quorum:<cycle>`.
 *
 * This is distinct from Seal candidate attestation at POST /api/vault/seal/attest
 * (seal_id, verdict, rationale, signature). Does not bypass seal-integrity gate
 * or mutate production KV beyond the quorum tracker key.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { bearerMatchesToken, getVaultAttestationToken } from '@/lib/vault-v2/auth';
import { parseSentinelQuorumSubmission } from '@/lib/mic/quorumAttestation';
import { registerSentinelAttestation } from '@/lib/mic/quorumTracker';

export const dynamic = 'force-dynamic';

/** Route liveness probe for ZEUS / operator verification (no KV writes). */
export async function GET() {
  return NextResponse.json({
    ok: true,
    route: '/api/vault/attest',
    seal_attestation_route: '/api/vault/seal/attest',
    methods: ['GET', 'POST'],
    purpose: 'C-298 sentinel cycle quorum registration',
    post_body: {
      agent: 'ATLAS | ZEUS | EVE | JADE | AUREA',
      cycle: 'C-<number>',
      confidence: '0..1',
      source: 'string (e.g. zeus-verification)',
    },
    note: 'POST registers mic:quorum:<cycle>. Seal candidate attestation uses /api/vault/seal/attest.',
  });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const submission = parseSentinelQuorumSubmission(body);
  if (typeof submission === 'string') {
    return NextResponse.json({ error: submission }, { status: 400 });
  }

  const agentToken = getVaultAttestationToken(submission.agent);
  if (!agentToken) {
    return NextResponse.json(
      { error: `No Vault attestation secret configured for ${submission.agent}` },
      { status: 503 },
    );
  }

  if (!bearerMatchesToken(req.headers.get('authorization'), agentToken)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const state = await registerSentinelAttestation(
    submission.cycle,
    submission.agent,
    submission.confidence,
    submission.source,
  );

  return NextResponse.json({
    ok: true,
    schema: state.schema,
    cycle: state.cycle,
    agent: submission.agent,
    confidence: submission.confidence,
    source: submission.source,
    attestations_received: state.attestations_received,
    attestations_needed: state.attestations_needed,
    status: state.status,
    attested_agents: Object.values(state.entries)
      .filter((entry) => entry?.attested)
      .map((entry) => entry!.agent),
    initiated_at: state.initiated_at,
    completed_at: state.completed_at,
    updated_at: state.updatedAt,
  });
}
