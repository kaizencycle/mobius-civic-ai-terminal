import { NextResponse } from 'next/server';
import { listAllSeals, listSeals, getCandidate } from '@/lib/vault-v2/store';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const [attestedSeals, auditSeals, candidate] = await Promise.all([
    listSeals(100),
    listAllSeals(100),
    getCandidate(),
  ]);

  const auditComplete = auditSeals.filter((seal) => Object.keys(seal.attestations ?? {}).length > 0);
  const attestedIds = new Set(attestedSeals.map((seal) => seal.seal_id));
  const auditOnly = auditSeals.filter((seal) => !attestedIds.has(seal.seal_id));

  return NextResponse.json({
    ok: true,
    readonly: true,
    vault_attested_count: attestedSeals.length,
    audit_finalized_count: auditSeals.length,
    audit_complete_attestation_count: auditComplete.length,
    audit_only_count: auditOnly.length,
    mismatch: auditComplete.length !== attestedSeals.length,
    interpretation: auditComplete.length !== attestedSeals.length
      ? 'Canon/audit history contains completed attestations that are not currently advanced into the attested chain index.'
      : 'Attested chain and complete audit history are aligned.',
    candidate: candidate ? {
      seal_id: candidate.seal_id,
      sequence: candidate.sequence,
      attestations_received: Object.keys(candidate.attestations ?? {}).length,
      timeout_at: candidate.timeout_at,
    } : null,
    attested_seals: attestedSeals.map((seal) => ({
      seal_id: seal.seal_id,
      sequence: seal.sequence,
      status: seal.status,
      seal_hash: seal.seal_hash,
      cycle_at_seal: seal.cycle_at_seal,
      substrate_attestation_id: seal.substrate_attestation_id ?? null,
    })),
    audit_only_seals: auditOnly.map((seal) => ({
      seal_id: seal.seal_id,
      sequence: seal.sequence,
      status: seal.status,
      seal_hash: seal.seal_hash,
      cycle_at_seal: seal.cycle_at_seal,
      attestations: Object.keys(seal.attestations ?? {}),
    })),
  }, {
    headers: {
      'Cache-Control': 'no-store',
      'X-Mobius-Source': 'attestation-state-debug',
    },
  });
}
