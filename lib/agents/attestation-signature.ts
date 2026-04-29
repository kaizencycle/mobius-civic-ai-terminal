import { createHash } from 'crypto';
import type { AgentLedgerAdapterPreview } from '@/lib/agents/ledger-adapter';

export type AgentAttestationSignature = {
  version: 'C-295.phase9.attestation-signature.v1';
  algorithm: 'sha256';
  agent: string;
  cycle: string;
  journal_id: string;
  ledger_entry_id: string;
  verification: 'zeus_verified' | 'adapter_eligible';
  quorum_required: boolean;
  signed_at: string;
  payload_hash: string;
};

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}

export function createAgentAttestationSignature(
  preview: AgentLedgerAdapterPreview,
  options: { quorumRequired: boolean; zeusVerified: boolean; signedAt?: string },
): AgentAttestationSignature {
  const signedAt = options.signedAt ?? new Date().toISOString();
  const payload = {
    agent: preview.agent,
    cycle: preview.cycle,
    decision: preview.decision,
    journal_id: preview.journal_id,
    ledger_entry: preview.ledger_entry,
    quorum_required: options.quorumRequired,
    zeus_verified: options.zeusVerified,
  };
  const payloadHash = createHash('sha256').update(stableStringify(payload)).digest('hex');

  return {
    version: 'C-295.phase9.attestation-signature.v1',
    algorithm: 'sha256',
    agent: preview.agent,
    cycle: preview.cycle,
    journal_id: preview.journal_id,
    ledger_entry_id: preview.ledger_entry.id,
    verification: options.zeusVerified ? 'zeus_verified' : 'adapter_eligible',
    quorum_required: options.quorumRequired,
    signed_at: signedAt,
    payload_hash: payloadHash,
  };
}
