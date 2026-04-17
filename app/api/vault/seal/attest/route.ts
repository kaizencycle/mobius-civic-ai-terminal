/**
 * POST /api/vault/seal/attest
 *
 * Agent endpoint. A Sentinel submits its attestation for the current in-flight
 * Seal candidate. Authed with AGENT_SERVICE_TOKEN (bearer).
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

export const dynamic = 'force-dynamic';

const AGENT_TOKEN = process.env.AGENT_SERVICE_TOKEN || '';

function authed(req: NextRequest): boolean {
  if (!AGENT_TOKEN) return false;
  const header = req.headers.get('authorization') || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (bearer.length !== AGENT_TOKEN.length) return false;
  let diff = 0;
  for (let i = 0; i < bearer.length; i++) {
    diff |= bearer.charCodeAt(i) ^ AGENT_TOKEN.charCodeAt(i);
  }
  return diff === 0;
}

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
    posture: r.agent === 'AUREA' ? (r.posture as Posture) : undefined,
  };
}

export async function POST(req: NextRequest) {
  if (!authed(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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

  if (!verifyAttestationSignature(AGENT_TOKEN, submission, candidate.seal_hash)) {
    return NextResponse.json({ error: 'Signature verification failed' }, { status: 401 });
  }

  const attestation: SealAttestation = {
    agent: submission.agent,
    verdict: submission.verdict,
    rationale: submission.rationale,
    mii_at_attestation: 0,
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
    attestations_needed: 5 - attestationsReceived,
  });
}
