/**
 * Vault v2 deposit path.
 *
 * Extends v1's `writeVaultDeposit` (lib/vault/vault.ts) with Seal candidate
 * formation. The v1 scoring and balance-accrual logic is unchanged — this
 * module wraps it and triggers candidate formation when the threshold is
 * crossed.
 *
 * Flow:
 *   1. v1 scores the deposit and writes to vault:deposits list (unchanged)
 *   2. accrueDepositV2 adds deposit_amount to vault:in_progress_balance
 *   3. If balance >= 50:
 *      a. Attempt to form a Seal candidate (may no-op if one already in flight)
 *      b. Reset in_progress_balance to overflow (balance - 50)
 *      c. Preserve overflow provenance: crossing-deposit hash is recorded on the
 *         candidate/seal as `carried_forward_deposit_hashes` and re-seeded into
 *         `vault:in_progress_hashes` for the next parcel
 *      d. Log the candidate creation
 *   4. If candidate formation is deferred (another in flight), the deposit
 *      amount stays in in_progress_balance; it will be included in the NEXT
 *      candidate once the current one resolves.
 */

import type { AgentJournalEntry } from '@/lib/terminal/types';
import { loadGIState } from '@/lib/kv/store';
import {
  getCandidate,
  getInProgressBalance,
  readInProgressHashes,
  setInProgressBalance,
  writeInProgressHashes,
} from '@/lib/vault-v2/store';
import { VAULT_RESERVE_PARCEL_UNITS } from '@/lib/vault-v2/constants';
import { formCandidate } from '@/lib/vault-v2/seal';
import type { Mode, SealCandidate } from '@/lib/vault-v2/types';

const THRESHOLD = VAULT_RESERVE_PARCEL_UNITS;

export type AccrualResult = {
  balance_after: number;
  candidate_formed: SealCandidate | null;
  candidate_deferred: boolean;
  overflow: number;
};

async function readGIAndMode(): Promise<{ gi: number; mode: Mode }> {
  let gi = 0.74;
  let mode: Mode = 'yellow';
  try {
    const st = await loadGIState();
    if (st && typeof st.global_integrity === 'number' && Number.isFinite(st.global_integrity)) {
      gi = Math.max(0, Math.min(1, st.global_integrity));
    }
    if (st && (st.mode === 'green' || st.mode === 'yellow' || st.mode === 'red')) {
      mode = st.mode;
    }
  } catch {
    // defaults
  }
  return { gi, mode };
}

/**
 * Accrue a deposit to in_progress_balance. If the accrual crosses the
 * threshold, attempt to form a Seal candidate. Returns the new balance
 * and the candidate outcome.
 *
 * This function is called AFTER v1's writeVaultDeposit has run. It does not
 * replace v1 — it adds the v2 semantics on top.
 */
export async function accrueDepositV2(args: {
  deposit_amount: number;
  content_signature: string;
  cycle: string;
  agent_entry?: AgentJournalEntry;
}): Promise<AccrualResult> {
  const prev = await getInProgressBalance();
  const next = Number((prev + args.deposit_amount).toFixed(6));

  // Track the content signature for inclusion in the Seal.
  const hashes = await readInProgressHashes();
  if (!hashes.includes(args.content_signature)) {
    hashes.push(args.content_signature);
    await writeInProgressHashes(hashes);
  }

  if (next < THRESHOLD) {
    await setInProgressBalance(next);
    return {
      balance_after: next,
      candidate_formed: null,
      candidate_deferred: false,
      overflow: 0,
    };
  }

  const overflow = Number((next - THRESHOLD).toFixed(6));
  const { gi, mode } = await readGIAndMode();

  // Check chain continuity: if a candidate is already in flight, defer.
  const existingCandidate = await getCandidate();
  if (existingCandidate) {
    await setInProgressBalance(next);
    return {
      balance_after: next,
      candidate_formed: null,
      candidate_deferred: true,
      overflow,
    };
  }

  const carried_forward =
    overflow > 0 && hashes.includes(args.content_signature)
      ? [args.content_signature]
      : undefined;

  const candidate = await formCandidate({
    cycle: args.cycle,
    gi_at_seal: gi,
    mode_at_seal: mode,
    source_entries: hashes.length,
    deposit_hashes: hashes,
    ...(carried_forward ? { carried_forward_deposit_hashes: carried_forward } : {}),
  });

  if (!candidate) {
    // Race: another writer formed a candidate between our check and our write.
    await setInProgressBalance(next);
    return {
      balance_after: next,
      candidate_formed: null,
      candidate_deferred: true,
      overflow,
    };
  }

  await setInProgressBalance(overflow);
  await writeInProgressHashes(carried_forward ?? []);

  console.info('[vault-v2] seal candidate formed', {
    seal_id: candidate.seal_id,
    sequence: candidate.sequence,
    gi_at_seal: gi,
    source_entries: candidate.source_entries,
    overflow_carried: overflow,
  });

  return {
    balance_after: overflow,
    candidate_formed: candidate,
    candidate_deferred: false,
    overflow,
  };
}

/**
 * Called by the attestation cron when a candidate finalizes. If there's
 * queued reserve from deposits that arrived during attestation, this
 * triggers the NEXT candidate formation immediately.
 */
export async function tryFormNextCandidate(args: { cycle: string }): Promise<SealCandidate | null> {
  const balance = await getInProgressBalance();
  if (balance < THRESHOLD) return null;

  const existing = await getCandidate();
  if (existing) return null;

  const { gi, mode } = await readGIAndMode();
  const hashes = await readInProgressHashes();

  const overflow = Number((balance - THRESHOLD).toFixed(6));
  const lastHash = hashes.length > 0 ? hashes[hashes.length - 1] : null;
  const carried_forward =
    overflow > 0 && lastHash ? [lastHash] : undefined;

  const candidate = await formCandidate({
    cycle: args.cycle,
    gi_at_seal: gi,
    mode_at_seal: mode,
    source_entries: hashes.length,
    deposit_hashes: hashes,
    ...(carried_forward ? { carried_forward_deposit_hashes: carried_forward } : {}),
  });

  if (candidate) {
    await setInProgressBalance(overflow);
    await writeInProgressHashes(carried_forward ?? []);
    console.info('[vault-v2] next candidate formed from queued reserve', {
      seal_id: candidate.seal_id,
      overflow_carried: overflow,
    });
  }
  return candidate;
}
