// ============================================================================
// C-340 — Knowledge Reserve Blocks (MDSL)
// ----------------------------------------------------------------------------
// A Reserve Block that seals *verified knowledge* instead of (only) reserve
// value. Same chain, same five-sentinel attestation model as a vault Seal —
// reused here, not duplicated — with a knowledge payload + KTT topology edges.
//
// Integrity stance: a block attests that a claim was verified by a named
// process, by named sentinels, at a confidence, from sourced inputs, at a
// cycle. It does NOT assert Truth. Provenance + process-integrity, not oracle.
//
// This module is the schema + pure packaging/validation layer only. Routing a
// draft through the EXISTING vault quorum (lib/vault-v2) to reach `attested`
// is Phase 2 (Tier-3, operator-reviewed) — deliberately not implemented here.
// ============================================================================

import type { SentinelAgent, SealAttestation } from '@/lib/vault-v2/types';

export const KNOWLEDGE_KEY_PREFIX = 'canon:knowledge:';
export const knowledgeKey = (blockId: string): string => `${KNOWLEDGE_KEY_PREFIX}${blockId}`;

export type KnowledgeStatus =
  | 'draft' // EVE-synthesized, awaiting quorum
  | 'attested' // quorum passed — visible in the encyclopedia
  | 'contested' // ZEUS / sentinel dispute → "citation needed"
  | 'superseded' // replaced by a newer block via prev_block_hash
  | 'refuted'; // an attested counter-claim won

export type KTTRelation =
  | 'derives_from'
  | 'related'
  | 'supersedes'
  | 'contested_by'
  | 'cites';

export type KTTEdge = {
  relation: KTTRelation;
  target_block_id: string;
};

/** Where the claim came from. Raw source payloads are NOT stored — only their
 *  hashes — which keeps the encyclopedia storable, CC0-shareable, and auditable. */
export type KnowledgeProvenance = {
  epicon_ids: string[];
  journal_ids: string[];
  signal_sources: string[]; // e.g. ['hermes-arxiv', 'gaia-usgs-water']
  source_hashes: string[]; // sha-256 of raw source payloads
};

export type KnowledgeBlock = {
  block_id: string;
  sequence: number;
  topic: string;
  /** The single attestable assertion. */
  claim: string;
  /** The encyclopedia article body (EVE-distilled). */
  canonical_summary: string;
  provenance: KnowledgeProvenance;
  /** Reuses the vault Seal attestation model — same five-sentinel quorum. */
  attestations: Partial<Record<SentinelAgent, SealAttestation>>;
  /** MII-weighted quorum confidence, 0..1. */
  confidence: number;
  status: KnowledgeStatus;
  /** KTT graph edges — the encyclopedia's cross-references. */
  topology: KTTEdge[];
  prev_block_hash: string | null;
  block_hash: string;
  cycle_at_seal: string;
  sealed_at: string;
  license: 'CC0-1.0';
  /** Civic Protocol Core / Substrate immortalization pointer (Phase 2). */
  substrate_attestation_id?: string | null;
};

// ---------------------------------------------------------------------------
// Deterministic hashing (runtime-agnostic: Web Crypto, available on node 20+/edge)
// ---------------------------------------------------------------------------

/** Stable, key-sorted JSON so the same content always hashes identically. */
function canonicalJSON(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJSON(obj[k])}`).join(',')}}`;
}

/** Hash everything except the block_hash field itself. */
export async function hashKnowledgeBlock(
  block: Omit<KnowledgeBlock, 'block_hash'>,
): Promise<string> {
  const data = new TextEncoder().encode(canonicalJSON(block));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ---------------------------------------------------------------------------
// Canonize — package an EVE synthesis into a draft block (pre-quorum)
// ---------------------------------------------------------------------------

export type CanonizeInput = {
  topic: string;
  claim: string;
  canonical_summary: string;
  provenance: KnowledgeProvenance;
  sequence: number;
  cycle_at_seal: string;
  prev_block_hash: string | null;
  topology?: KTTEdge[];
  /** Pre-quorum confidence hint from the synthesizer; refined at attestation. */
  confidence?: number;
};

/**
 * Deterministically package a synthesized entry into a `draft` KnowledgeBlock.
 * Attestations are empty until quorum (Phase 2). EVE supplies claim/summary;
 * this step does the hashing + provenance binding, nothing more.
 */
export async function canonizeEntry(input: CanonizeInput): Promise<KnowledgeBlock> {
  const block_id = `kb-${input.cycle_at_seal}-${String(input.sequence).padStart(4, '0')}`;
  const base: Omit<KnowledgeBlock, 'block_hash'> = {
    block_id,
    sequence: input.sequence,
    topic: input.topic,
    claim: input.claim,
    canonical_summary: input.canonical_summary,
    provenance: input.provenance,
    attestations: {},
    confidence: clamp01(input.confidence ?? 0),
    status: 'draft',
    topology: input.topology ?? [],
    prev_block_hash: input.prev_block_hash,
    cycle_at_seal: input.cycle_at_seal,
    sealed_at: new Date().toISOString(),
    license: 'CC0-1.0',
  };
  return { ...base, block_hash: await hashKnowledgeBlock(base) };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type ValidationResult = { ok: boolean; errors: string[] };

const VALID_STATUS: readonly KnowledgeStatus[] = [
  'draft',
  'attested',
  'contested',
  'superseded',
  'refuted',
];

export async function validateKnowledgeBlock(block: KnowledgeBlock): Promise<ValidationResult> {
  const errors: string[] = [];

  if (!block.block_id) errors.push('block_id missing');
  if (!block.claim?.trim()) errors.push('claim is empty');
  if (!block.canonical_summary?.trim()) errors.push('canonical_summary is empty');
  if (block.license !== 'CC0-1.0') errors.push('license must be CC0-1.0');
  if (!VALID_STATUS.includes(block.status)) errors.push(`invalid status: ${block.status}`);
  if (block.confidence < 0 || block.confidence > 1) errors.push('confidence out of [0,1]');

  // Provenance: an encyclopedia entry must be sourced.
  const p = block.provenance;
  const sourced = (p?.epicon_ids?.length ?? 0) + (p?.journal_ids?.length ?? 0) + (p?.source_hashes?.length ?? 0);
  if (sourced === 0) errors.push('unsourced: provenance has no epicon/journal/source references');

  // Attested entries must carry quorum: ZEUS pass, no non-ZEUS reject, ≥4 passes.
  if (block.status === 'attested') {
    const zeus = block.attestations.ZEUS;
    if (zeus?.verdict !== 'pass') errors.push('attested block requires ZEUS pass');

    const nonZeusRejects = (Object.keys(block.attestations) as SentinelAgent[]).filter(
      (a) => a !== 'ZEUS' && block.attestations[a]?.verdict === 'reject',
    );
    if (nonZeusRejects.length > 0) errors.push(`attested block has non-ZEUS reject(s): ${nonZeusRejects.join(', ')}`);

    const passes = Object.values(block.attestations).filter((a) => a?.verdict === 'pass').length;
    if (passes < 4) errors.push(`attested block has only ${passes}/5 passing attestations (need ≥4, ZEUS non-reject)`);
  }

  // Hash integrity — recompute and compare.
  const { block_hash, ...rest } = block;
  const recomputed = await hashKnowledgeBlock(rest);
  if (recomputed !== block_hash) errors.push('block_hash does not match content (tampered or stale)');

  return { ok: errors.length === 0, errors };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
