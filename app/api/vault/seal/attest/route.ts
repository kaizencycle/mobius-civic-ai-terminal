/**
 * POST /api/vault/seal/attest
 *
 * Agent endpoint. A Sentinel submits its attestation for the current in-flight
 * Seal candidate. Bearer auth uses that sentinel's Vault secret (see
 * `getVaultAttestationToken`), with legacy fallback to AGENT_SERVICE_TOKEN.
 *
 * Body:
 *   {
 *     seal_id: string,
 *     agent: SentinelAgent,
 *     verdict: "pass" | "flag" | "reject",
 *     rationale: string,
 *     signature: string,   // HMAC from computeAttestationSignature()
 *     posture?: Posture    // required from AUREA only
 *   }
 *
 * Signature is verified before acceptance. Idempotent — same agent submitting
 * twice replaces the prior attestation (useful for corrections within the
 * attestation window).
 *
 * Does NOT trigger quorum finalization — that's the cron's job. This endpoint
 * only records the submission.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { bearerMatchesToken, getVaultAttestationToken } from '@/lib/vault-v2/auth';
import { getCandidate, recordAttestation } from '@/lib/vault-v2/store';
import { verifyAttestationSignature } from '@/lib/vault-v2/seal';
import type {
  AttestationSubmission,
  Posture,
  SealAttestation,
  SentinelAgent,
  Verdict,
} from '@/lib/vault-v2/types';
import { SENTINEL_AGENTS } from '@/lib/vault-v2/types';
import { SENTINEL_ATTESTATION_COUNT } from '@/lib/vault-v2/constants';

export const dynamic = 'force-dynamic';

function validate(raw: unknown): AttestationSubmission | string {
  if (!raw || typeof raw !== 'object') return 'body must be an object';
  const r = raw as Record<string, unknown>;

  if (typeof r.seal_id !== 'string' || !r.seal_id.startsWith('seal-')) {
    return 'invalid seal_id';
  }
  if (typeof r.agent !== 'string' || !SENTINEL_AGENTS.includes(r.agent as SentinelAgent)) {
    return `agent must be one of ${SENTINEL_AGENTS.join(', ')}`;
  }
  if (r.verdict !== 'pass' && r.verdict !== 'flag' && r.verdict !== 'reject') {
    return 'verdict must be pass|flag|reject';
  }
  if (typeof r.rationale !== 'string' || r.rationale.trim().length === 0) {
    return 'rationale required';
  }
  if (typeof r.signature !== 'string' || r.signature.length === 0) {
    return 'signature required';
  }
  let mii_at_attestation: number | undefined;
  if (r.mii_at_attestation !== undefined) {
    if (typeof r.mii_at_attestation !== 'number' || !Number.isFinite(r.mii_at_attestation)) {
      return 'mii_at_attestation must be a finite number when provided';
    }
    mii_at_attestation = r.mii_at_attestation;
  }
  if (r.agent === 'AUREA') {
    const posture = r.posture;
    if (
      posture !== 'confident' &&
      posture !== 'cautionary' &&
      posture !== 'stressed' &&
      posture !== 'degraded'
    ) {
      return 'AUREA must include posture: confident|cautionary|stressed|degraded';
    }
  } else if (r.posture !== undefined) {
    return 'posture only accepted from AUREA';
  }

  return {
    seal_id: r.seal_id,
    agent: r.agent as SentinelAgent,
    verdict: r.verdict as Verdict,
    rationale: (r.rationale as string).trim().slice(0, 2000),
    signature: r.signature as string,
    ...(mii_at_attestation !== undefined ? { mii_at_attestation } : {}),
    posture: r.agent === 'AUREA' ? (r.posture as Posture) : undefined,
  };
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const submission = validate(body);
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

  const candidate = await getCandidate();
  if (!candidate) {
    return NextResponse.json({ error: 'No in-flight candidate' }, { status: 404 });
  }
  if (candidate.seal_id !== submission.seal_id) {
    return NextResponse.json(
      {
        error: 'seal_id does not match current candidate',
        current: candidate.seal_id,
      },
      { status: 409 },
    );
  }
  if (new Date(candidate.timeout_at).getTime() < Date.now()) {
    return NextResponse.json(
      { error: 'Attestation window closed (timeout reached)' },
      { status: 410 },
    );
  }

  if (!verifyAttestationSignature(agentToken, submission, candidate.seal_hash)) {
    return NextResponse.json(
      { error: 'Signature verification failed (wrong seal_hash or tampered body)' },
      { status: 400 },
    );
  }

  const attestation: SealAttestation = {
    agent: submission.agent,
    verdict: submission.verdict,
    rationale: submission.rationale,
    ...(submission.mii_at_attestation !== undefined
      ? { mii_at_attestation: submission.mii_at_attestation }
      : {}),
    gi_at_attestation: candidate.gi_at_seal,
    timestamp: new Date().toISOString(),
    signature: submission.signature,
    ...(submission.posture ? { posture: submission.posture } : {}),
  };

  const updated = await recordAttestation(submission.seal_id, submission.agent, attestation);

  if (!updated) {
    return NextResponse.json({ error: 'Failed to record attestation' }, { status: 500 });
  }

  const attestationsReceived = Object.keys(updated.attestations).length;
  return NextResponse.json({
    ok: true,
    seal_id: submission.seal_id,
    agent: submission.agent,
    verdict: submission.verdict,
    attestations_received: attestationsReceived,
    attestations_needed: SENTINEL_ATTESTATION_COUNT - attestationsReceived,
  });
}
