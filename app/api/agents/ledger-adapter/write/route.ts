// PATCHED VERSION (only relevant diff shown conceptually)
import { authorizeLedgerWriteByQuorum } from '@/lib/agents/quorum-trust';

// ...inside POST, after previews are built

const ledgerSnapshotRes = await fetch(new URL('/api/chambers/ledger', request.nextUrl.origin), { cache: 'no-store' });
const ledgerJson = await ledgerSnapshotRes.json();
const ledgerEntries = Array.isArray(ledgerJson?.events) ? ledgerJson.events : [];

for (const preview of previews) {
  const key = receiptKey(preview.journal_id);
  const existing = await kvGet<AdapterWriteReceipt>(key);
  if (existing) {
    receipts.push({ ...existing, status: 'duplicate', reason: 'journal_already_written_to_ledger' });
    continue;
  }

  if (quorumRequired) {
    const decision = authorizeLedgerWriteByQuorum(ledgerEntries, preview.agent, preview.cycle);
    if (!decision.authorized) {
      receipts.push({
        journal_id: preview.journal_id,
        ledger_entry_id: preview.ledger_entry.id,
        external_entry_id: null,
        agent: preview.agent,
        cycle: preview.cycle,
        status: 'skipped',
        reason: `quorum_blocked:${decision.reason}`,
        timestamp: new Date().toISOString(),
      });
      continue;
    }
  }

  if (dryRun) {
    receipts.push({
      journal_id: preview.journal_id,
      ledger_entry_id: preview.ledger_entry.id,
      external_entry_id: null,
      agent: preview.agent,
      cycle: preview.cycle,
      status: 'skipped',
      reason: 'dry_run_no_write',
      timestamp: new Date().toISOString(),
    });
    continue;
  }

  const write = await writeToSubstrate(previewToSubstrateInput(preview, { quorumRequired, zeusVerified }));
  // rest unchanged
