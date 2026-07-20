/**
 * C-377 — Reserve Block history row status (display-only; no UI-derived truth).
 */

import type { ReserveBlockSummary } from '@/lib/vault/lane-status';

export type BlockRowStatus =
  | 'attested'
  | 'immortalized'
  | 'indexed'
  | 'contested'
  | 'contested (3-way)'
  | 'quarantined audit'
  | 'legacy v1 parcel'
  | 'in progress';

export type BlockRow = {
  id: number;
  amount: number;
  status: BlockRowStatus;
};

export function resolveHistoricalBlockStatus(args: {
  blockNumber: number;
  attested: boolean;
  audited: boolean;
  isLatestAttested: boolean;
  latestImmortalized: boolean;
  integrityHold: boolean;
  collisionAffected: ReadonlySet<number> | null | undefined;
  threeWayBlocks: ReadonlySet<number> | null | undefined;
}): BlockRowStatus {
  const {
    blockNumber,
    attested,
    audited,
    isLatestAttested,
    latestImmortalized,
    integrityHold,
    collisionAffected,
    threeWayBlocks,
  } = args;

  if (isLatestAttested && latestImmortalized && !integrityHold) {
    return 'immortalized';
  }
  if (attested) {
    if (integrityHold) {
      if (threeWayBlocks?.has(blockNumber)) return 'contested (3-way)';
      if (collisionAffected?.has(blockNumber)) return 'contested';
      return 'indexed';
    }
    return 'attested';
  }
  if (audited) return 'quarantined audit';
  return 'legacy v1 parcel';
}

export function buildReserveBlockRows(args: {
  block: ReserveBlockSummary;
  latestImmortalized: boolean;
  integrityHold: boolean;
  collisionAffected?: ReadonlySet<number> | null;
  threeWayBlocks?: ReadonlySet<number> | null;
}): BlockRow[] {
  const maxCompleted = Math.max(
    args.block.audit_blocks,
    args.block.completed_blocks_v1,
    args.block.sealed_blocks,
  );
  const rows: BlockRow[] = [];

  for (let i = 1; i <= maxCompleted; i += 1) {
    const attested = i <= args.block.sealed_blocks;
    const audited = i <= args.block.audit_blocks;
    const isLatestAttested = attested && i === args.block.sealed_blocks;
    rows.push({
      id: i,
      amount: args.block.block_size,
      status: resolveHistoricalBlockStatus({
        blockNumber: i,
        attested,
        audited,
        isLatestAttested,
        latestImmortalized: args.latestImmortalized,
        integrityHold: args.integrityHold,
        collisionAffected: args.collisionAffected,
        threeWayBlocks: args.threeWayBlocks,
      }),
    });
  }

  rows.push({
    id: args.block.in_progress_block,
    amount: args.block.in_progress_balance,
    status: 'in progress',
  });

  return rows;
}

export function blockRowLabel(row: BlockRow): string {
  return row.status === 'in progress' ? `Projected slot ${row.id}` : `Block ${row.id}`;
}

export function blockStatusClass(status: BlockRowStatus): string {
  switch (status) {
    case 'immortalized':
      return 'text-cyan-300';
    case 'attested':
      return 'text-emerald-300';
    case 'indexed':
      return 'text-violet-300';
    case 'contested':
      return 'text-amber-300';
    case 'contested (3-way)':
      return 'text-orange-300';
    case 'quarantined audit':
      return 'text-amber-300';
    case 'in progress':
      return 'text-cyan-300';
    default:
      return 'text-slate-400';
  }
}
