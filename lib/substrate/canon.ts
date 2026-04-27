import { hashPayload } from '@/lib/agents/signatures';
import { historicalAttestationDigest } from '@/lib/vault-v2/historical-attestation';
import { getSeal, listAllSeals } from '@/lib/vault-v2/store';
import type { Seal, SealAttestation, SentinelAgent } from '@/lib/vault-v2/types';
import { SENTINEL_AGENTS } from '@/lib/vault-v2/types';

export const SUBSTRATE_CANON_VERSION = 'C-293.phase8.v2' as const;

export type CanonEventType =
  | 'epicon'
  | 'journal'
  | 'reserve_block'
  | 'incident'
  | 'rollback_plan'
  | 'substrate_attestation';

export type CanonFilterType = CanonEventType | 'reserve_blocks' | 'substrate_attestations';

export type CanonAttestationMode = 'missing' | 'partial' | 'complete' | 'timed_out' | 'failed';

export type CanonCounts = {
  total_seals: number;
  attested: number;
  quarantined_timeout: number;
  quarantined_other: number;
  rejected: number;
  needs_reattestation: number;
};

export type CanonAttestationView = {
  agent: SentinelAgent;
  signed: boolean;
  signed_at: string | null;
  verdict: SealAttestation['verdict'] | 'missing';
  posture?: SealAttestation['posture'] | null;
  signature_short: string | null;
  signature_hash: string | null;
  historical: boolean;
};

export type CanonReserveBlockView = {
  type: 'reserve_block';
  block_number: number;
  amount: 50;
  status: Seal['status'];
  fountain_status: Seal['fountain_status'];
  seal_id: string;
  seal_hash: string;
  previous_seal_hash: string | null;
  cycle_at_seal: string;
  sealed_at: string;
  gi_at_seal: number;
  mode_at_seal: Seal['mode_at_seal'];
  source_entries: number;
  deposit_hashes_count: number;
  attestation_state: CanonAttestationMode;
  missing_agents: SentinelAgent[];
  attestations: CanonAttestationView[];
  substrate_pointer: {
    attestation_id: string | null;
    event_hash: string | null;
    attested_at: string | null;
    error: string | null;
  };
  needs_reattestation: boolean;
  historical_digest: ReturnType<typeof historicalAttestationDigest>;
};

export type CanonTimelineEvent = {
  id: string;
  type: CanonEventType;
  title: string;
  timestamp: string;
  cycle: string | null;
  severity: 'info' | 'watch' | 'proof' | 'incident';
  seal_id?: string;
  hash?: string | null;
  summary: string;
};

export type CanonResponse = {
  ok: true;
  version: typeof SUBSTRATE_CANON_VERSION;
  readonly: true;
  count: number;
  counts: CanonCounts;
  reserve_blocks: CanonReserveBlockView[];
  timeline: CanonTimelineEvent[];
  canon: string[];
};

function shortSignature(signature: string | undefined): string | null {
  if (!signature) return null;
  if (signature.length <= 16) return signature;
  return `${signature.slice(0, 10)}…${signature.slice(-6)}`;
}

function isTimeoutSignature(signature: string | null): boolean {
  return signature === 'timeout' || signature?.toLowerCase().includes('timeout') === true;
}

function attestationToView(agent: SentinelAgent, attestation: SealAttestation | undefined): CanonAttestationView {
  const historical = attestation?.rationale?.startsWith('[historical]') ?? false;
  return {
    agent,
    signed: Boolean(attestation?.signature),
    signed_at: attestation?.timestamp ?? null,
    verdict: attestation?.verdict ?? 'missing',
    posture: attestation?.posture ?? null,
    signature_short: shortSignature(attestation?.signature),
    signature_hash: attestation?.signature ? hashPayload({ agent, signature: attestation.signature }) : null,
    historical,
  };
}

function attestationState(seal: Seal, attestations: CanonAttestationView[], missingAgents: SentinelAgent[]): CanonAttestationMode {
  if (missingAgents.length === SENTINEL_AGENTS.length) return 'missing';
  if (missingAgents.length > 0) return 'partial';
  const allTimeoutFlagged = attestations.every((a) => a.verdict === 'flag' && isTimeoutSignature(a.signature_short));
  if (seal.status === 'quarantined' && allTimeoutFlagged) return 'timed_out';
  if (seal.status === 'quarantined' || seal.status === 'rejected') return 'failed';
  return 'complete';
}

export function sealToCanonReserveBlock(seal: Seal): CanonReserveBlockView {
  const attestations = SENTINEL_AGENTS.map((agent) => attestationToView(agent, seal.attestations?.[agent]));
  const missingAgents = attestations.filter((a) => !a.signed).map((a) => a.agent);
  const state = attestationState(seal, attestations, missingAgents);
  return {
    type: 'reserve_block',
    block_number: seal.sequence,
    amount: seal.reserve,
    status: seal.status,
    fountain_status: seal.fountain_status,
    seal_id: seal.seal_id,
    seal_hash: seal.seal_hash,
    previous_seal_hash: seal.prev_seal_hash,
    cycle_at_seal: seal.cycle_at_seal,
    sealed_at: seal.sealed_at,
    gi_at_seal: seal.gi_at_seal,
    mode_at_seal: seal.mode_at_seal,
    source_entries: seal.source_entries,
    deposit_hashes_count: seal.deposit_hashes.length,
    attestation_state: state,
    missing_agents: missingAgents,
    attestations,
    substrate_pointer: {
      attestation_id: seal.substrate_attestation_id ?? null,
      event_hash: seal.substrate_event_hash ?? null,
      attested_at: seal.substrate_attested_at ?? null,
      error: seal.substrate_attestation_error ?? null,
    },
    needs_reattestation: seal.status === 'quarantined' || state === 'timed_out' || state === 'failed',
    historical_digest: historicalAttestationDigest(seal),
  };
}

function reserveBlockToTimeline(block: CanonReserveBlockView): CanonTimelineEvent[] {
  const events: CanonTimelineEvent[] = [
    {
      id: `reserve-block:${block.seal_id}`,
      type: 'reserve_block',
      title: `Reserve Block ${block.block_number}`,
      timestamp: block.sealed_at,
      cycle: block.cycle_at_seal,
      severity: block.status === 'attested' && block.attestation_state === 'complete' ? 'proof' : block.needs_reattestation ? 'incident' : 'watch',
      seal_id: block.seal_id,
      hash: block.seal_hash,
      summary: `${block.amount} MIC · ${block.status} · ${block.attestation_state}${block.needs_reattestation ? ' · needs re-attestation' : ''}`,
    },
  ];

  if (block.substrate_pointer.attestation_id || block.substrate_pointer.event_hash) {
    events.push({
      id: `substrate:${block.seal_id}`,
      type: 'substrate_attestation',
      title: `Substrate pointer · Block ${block.block_number}`,
      timestamp: block.substrate_pointer.attested_at ?? block.sealed_at,
      cycle: block.cycle_at_seal,
      severity: 'proof',
      seal_id: block.seal_id,
      hash: block.substrate_pointer.event_hash,
      summary: block.substrate_pointer.attestation_id ?? 'Substrate event hash recorded',
    });
  }

  if (block.substrate_pointer.error) {
    events.push({
      id: `substrate-error:${block.seal_id}`,
      type: 'incident',
      title: `Substrate attestation error · Block ${block.block_number}`,
      timestamp: block.sealed_at,
      cycle: block.cycle_at_seal,
      severity: 'incident',
      seal_id: block.seal_id,
      hash: block.seal_hash,
      summary: block.substrate_pointer.error,
    });
  }

  return events;
}

function sortTimeline(events: CanonTimelineEvent[]): CanonTimelineEvent[] {
  return [...events].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
}

function buildCounts(blocks: CanonReserveBlockView[]): CanonCounts {
  return {
    total_seals: blocks.length,
    attested: blocks.filter((b) => b.status === 'attested' && b.attestation_state === 'complete').length,
    quarantined_timeout: blocks.filter((b) => b.status === 'quarantined' && b.attestation_state === 'timed_out').length,
    quarantined_other: blocks.filter((b) => b.status === 'quarantined' && b.attestation_state !== 'timed_out').length,
    rejected: blocks.filter((b) => b.status === 'rejected').length,
    needs_reattestation: blocks.filter((b) => b.needs_reattestation).length,
  };
}

export async function buildSubstrateCanon(options: { limit?: number; type?: CanonFilterType | null; seal_id?: string | null } = {}): Promise<CanonResponse> {
  const limit = Math.max(1, Math.min(100, Math.floor(options.limit ?? 50)));
  const seals = options.seal_id ? [await getSeal(options.seal_id)] : await listAllSeals(limit);
  const reserveBlocks = seals.filter((seal): seal is Seal => Boolean(seal)).map(sealToCanonReserveBlock);
  const allTimeline = sortTimeline(reserveBlocks.flatMap(reserveBlockToTimeline));

  const type = options.type ?? null;
  const filteredReserveBlocks = type === 'reserve_blocks' || type === 'reserve_block' || !type ? reserveBlocks : [];
  const filteredTimeline = type && type !== 'reserve_blocks'
    ? allTimeline.filter((event) => event.type === (type === 'substrate_attestations' ? 'substrate_attestation' : type))
    : allTimeline;

  return {
    ok: true,
    version: SUBSTRATE_CANON_VERSION,
    readonly: true,
    count: type && type !== 'reserve_blocks' ? filteredTimeline.length : filteredReserveBlocks.length,
    counts: buildCounts(filteredReserveBlocks.length ? filteredReserveBlocks : reserveBlocks),
    reserve_blocks: filteredReserveBlocks,
    timeline: filteredTimeline,
    canon: [
      'Substrate canon is read-only in Phase 8.',
      'Historical attestation validates stored proof only.',
      'Historical attestation does not rewrite history or pretend agents signed live at the time.',
      'Historical attestation does not unlock Fountain by itself.',
      'Quarantined timeout blocks require re-attestation before they count as canonical attested blocks.',
      'No rollback without proof, operator consent, and preserved incident history.',
    ],
  };
}
