'use client';

// ... (same file unchanged above)

function buildBlockRows(block: ReserveBlockSummary, latestImmortalized: boolean): BlockRow[] {
  const maxCompleted = Math.max(block.audit_blocks, block.completed_blocks_v1, block.sealed_blocks);
  const rows: BlockRow[] = [];
  for (let i = 1; i <= maxCompleted; i += 1) {
    const attested = i <= block.sealed_blocks;
    const audited = i <= block.audit_blocks;
    const isLatestAttested = attested && i === block.sealed_blocks;
    rows.push({
      id: i,
      amount: block.block_size,
      status: isLatestAttested && latestImmortalized
        ? 'immortalized'
        : attested
          ? 'attested'
          : audited
            ? 'quarantined audit'
            : 'legacy v1 parcel',
    });
  }
  rows.push({ id: block.in_progress_block, amount: block.in_progress_balance, status: 'in progress' });
  return rows;
}

function blockStatusClass(status: BlockRow['status']): string {
  switch (status) {
    case 'immortalized':
      return 'text-cyan-300';
    case 'attested':
      return 'text-emerald-300';
    case 'quarantined audit':
      return 'text-amber-300';
    case 'in progress':
      return 'text-cyan-300';
    default:
      return 'text-slate-400';
  }
}

// ... rest unchanged
