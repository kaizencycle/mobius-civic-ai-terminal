/**
 * C-373 append-only seal collision reconciliation receipts.
 * EPICON: EPICON_C-373_ATLAS_vault-kv-canonical-lineage-recovery_v1
 */

import { createHash } from 'node:crypto';
import { kvGet, kvSet } from '@/lib/kv/store';
import type { CollisionAuditReport } from '@/lib/watchdog/collisionAudit';

export const RECEIPT_SCHEMA_VERSION = '1.0' as const;

export type ResolutionStatus =
  | 'proposed'
  | 'challenged'
  | 'approved'
  | 'applied'
  | 'quarantined'
  | 'rejected';

export type VerdictStatus = 'pending' | 'approved' | 'rejected' | 'challenged';

export type SealCollisionResolutionReceipt = {
  schema_version: typeof RECEIPT_SCHEMA_VERSION;
  receipt_type: 'seal_collision_resolution';
  receipt_id: string;
  cycle: string;
  block_number: number;
  canonical_seal_id: string;
  conflicting_seal_ids: string[];
  canonical_reason: string[];
  evidence_refs: string[];
  original_hashes: Record<string, string>;
  kv_snapshot: Record<string, string>;
  resolution_status: ResolutionStatus;
  zeus_verdict: VerdictStatus;
  eve_verdict: VerdictStatus;
  human_approval: VerdictStatus;
  created_at: string;
  receipt_hash: string;
};

export const RECEIPT_INDEX_KEY = 'watchdog:collision:receipts:index';

function receiptKey(receipt_id: string): string {
  return `watchdog:collision:receipt:${receipt_id}`;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value, Object.keys(value as object).sort());
}

/** Hash excludes receipt_hash field (witness of immutability). */
export function computeReceiptHash(
  receipt: Omit<SealCollisionResolutionReceipt, 'receipt_hash'>,
): string {
  return createHash('sha256').update(stableStringify(receipt)).digest('hex');
}

export function sealReceipt(
  receipt: Omit<SealCollisionResolutionReceipt, 'receipt_hash'> & { receipt_hash?: string },
): SealCollisionResolutionReceipt {
  const { receipt_hash: _ignored, ...body } = receipt as SealCollisionResolutionReceipt;
  const receipt_hash = computeReceiptHash(body);
  return { ...body, receipt_hash };
}

export function verifyReceiptHash(receipt: SealCollisionResolutionReceipt): boolean {
  const { receipt_hash, ...body } = receipt;
  return computeReceiptHash(body) === receipt_hash;
}

export function isReceiptApprovedForRepair(receipt: SealCollisionResolutionReceipt): boolean {
  if (receipt.resolution_status !== 'approved') return false;
  if (receipt.human_approval !== 'approved') return false;
  const hashes = new Set(Object.values(receipt.original_hashes));
  const hashDivergent = hashes.size > 1;
  if (!hashDivergent) return true;
  return receipt.zeus_verdict === 'approved' && receipt.eve_verdict === 'approved';
}

export function verifyKvSnapshotUnchanged(
  receipt: SealCollisionResolutionReceipt,
  current: Record<string, string>,
): { ok: boolean; stale: string[] } {
  const stale: string[] = [];
  for (const [seal_id, expected_hash] of Object.entries(receipt.kv_snapshot)) {
    const current_hash = current[seal_id];
    if (current_hash !== expected_hash) {
      stale.push(seal_id);
    }
  }
  return { ok: stale.length === 0, stale };
}

export function buildReceiptFromCollision(args: {
  audit: CollisionAuditReport;
  block_number: number;
  canonical_seal_id: string;
  canonical_reason: string[];
  evidence_refs?: string[];
  receipt_id?: string;
}): SealCollisionResolutionReceipt {
  const collision = args.audit.collisions.find((c) => c.block_number === args.block_number);
  if (!collision) {
    throw new Error(`block_number ${args.block_number} not in audit collisions`);
  }

  const conflicting = collision.candidate_seals
    .map((s) => s.seal_id)
    .filter((id) => id !== args.canonical_seal_id);

  const original_hashes: Record<string, string> = {};
  for (const seal of collision.candidate_seals) {
    original_hashes[seal.seal_id] = seal.seal_hash;
  }

  const snapshot: Record<string, string> = {};
  for (const seal_id of [args.canonical_seal_id, ...conflicting]) {
    const hash = args.audit.kv_snapshot[seal_id];
    if (hash) snapshot[seal_id] = hash;
  }

  const body: Omit<SealCollisionResolutionReceipt, 'receipt_hash'> = {
    schema_version: RECEIPT_SCHEMA_VERSION,
    receipt_type: 'seal_collision_resolution',
    receipt_id:
      args.receipt_id ??
      `rcpt-${args.audit.cycle}-b${String(args.block_number).padStart(3, '0')}-${Date.now()}`,
    cycle: args.audit.cycle,
    block_number: args.block_number,
    canonical_seal_id: args.canonical_seal_id,
    conflicting_seal_ids: conflicting,
    canonical_reason: args.canonical_reason,
    evidence_refs: args.evidence_refs ?? [],
    original_hashes,
    kv_snapshot: snapshot,
    resolution_status: 'proposed',
    zeus_verdict: collision.hash_divergent ? 'pending' : 'pending',
    eve_verdict: collision.hash_divergent ? 'pending' : 'pending',
    human_approval: 'pending',
    created_at: new Date().toISOString(),
  };

  return sealReceipt(body);
}

export async function appendReceiptToIndex(receipt_id: string): Promise<void> {
  const index = (await kvGet<string[]>(RECEIPT_INDEX_KEY)) ?? [];
  if (!index.includes(receipt_id)) {
    index.push(receipt_id);
    await kvSet(RECEIPT_INDEX_KEY, index);
  }
}

export async function saveReceipt(receipt: SealCollisionResolutionReceipt): Promise<void> {
  if (!verifyReceiptHash(receipt)) {
    throw new Error('refusing to save receipt with invalid receipt_hash');
  }
  await kvSet(receiptKey(receipt.receipt_id), receipt);
  await appendReceiptToIndex(receipt.receipt_id);
}

export async function loadReceipt(receipt_id: string): Promise<SealCollisionResolutionReceipt | null> {
  return kvGet<SealCollisionResolutionReceipt>(receiptKey(receipt_id));
}

export async function loadReceiptFromPathOrId(
  pathOrId: string,
): Promise<SealCollisionResolutionReceipt> {
  if (pathOrId.startsWith('rcpt-')) {
    const loaded = await loadReceipt(pathOrId);
    if (!loaded) throw new Error(`receipt not found in KV: ${pathOrId}`);
    return loaded;
  }
  const { readFileSync } = await import('node:fs');
  const raw = readFileSync(pathOrId, 'utf8');
  const parsed = JSON.parse(raw) as SealCollisionResolutionReceipt;
  return parsed;
}
