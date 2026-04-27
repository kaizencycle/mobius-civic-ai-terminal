import { type NextRequest, NextResponse } from 'next/server';
import { getServiceAuthError } from '@/lib/security/serviceAuth';
import { listAllSeals, listSeals, getCandidate } from '@/lib/vault-v2/store';
import { SENTINEL_AGENTS } from '@/lib/vault-v2/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function hasFullSentinelQuorum(seal: { attestations?: unknown }): boolean {
  const attestations = seal.attestations && typeof seal.attestations === 'object'
    ? seal.attestations as Record<string, unknown>
    : {};
  return SENTINEL_AGENTS.every((agent) => Boolean(attestations[agent]));
}

function attestationAgents(seal: { attestations?: unknown }): string[] {
  const attestations = seal.attestations && typeof seal.attestations === 'object'
    ? seal.attestations as Record<string, unknown>
    : {};
  return Object.keys(attestations);
}

export async function GET(request: NextRequest) {
  const authErr = getServiceAuthError(request);
  if (authErr) return authErr;

  const [attestedSeals, auditSeals, candidate] = await Promise.all([
    listSeals(100),
    listAllSeals(100),
    getCandidate(),
  ]);

  const auditComplete = auditSeals.filter(hasFullSentinelQuorum);
  const attestedIds = new Set(attestedSeals.map((seal) => seal.seal_id));
  const auditOnly = auditSeals.filter((seal) => !attestedIds.has(seal.seal_id));
  const partialAudit = auditSeals.filter((seal) => attestationAgents(seal).length > 0 && !hasFullSentinelQuorum(seal));

  return NextResponse.json({
    ok: true,
    readonly: true,
    auth: 'service',
    quorum_required_agents: SENTINEL_AGENTS,
    vault_attested_count: attestedSeals.length,
    audit_finalized_count: auditSeals.length,
    audit_complete_attestation_count: auditComplete.length,
    audit_partial_attestation_count: partialAudit.length,
    audit_only_count: auditOnly.length,
    mismatch: auditComplete.length !== attestedSeals.length,
    interpretation: auditComplete.length !== attestedSeals.length
      ? 'Audit history contains full-quorum attestations that are not currently advanced into the attested chain index.'
      : 'Attested chain and full-quorum audit history are aligned.',
    candidate: candidate ? {
      seal_id: candidate.seal_id,
      sequence: candidate.sequence,
      attestations_received: Object.keys(candidate.attestations ?? {}).length,
      missing_agents: SENTINEL_AGENTS.filter((agent) => !candidate.attestations?.[agent]),
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
      full_quorum: hasFullSentinelQuorum(seal),
      attestations: attestationAgents(seal),
      missing_agents: SENTINEL_AGENTS.filter((agent) => !seal.attestations?.[agent]),
    })),
    partial_audit_seals: partialAudit.map((seal) => ({
      seal_id: seal.seal_id,
      sequence: seal.sequence,
      status: seal.status,
      cycle_at_seal: seal.cycle_at_seal,
      attestations: attestationAgents(seal),
      missing_agents: SENTINEL_AGENTS.filter((agent) => !seal.attestations?.[agent]),
    })),
  }, {
    headers: {
      'Cache-Control': 'no-store',
      'X-Mobius-Source': 'attestation-state-debug',
    },
  });
}
