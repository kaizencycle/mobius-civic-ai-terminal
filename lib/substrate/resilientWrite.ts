// C-333 — Resilient substrate write decision (the journaling-cascade fix).
// C-356 — resilientSet: KV write with budget-suspension swallow.
//
// THE BUG (live this cycle): /api/agents/journal awaited writeToSubstrate() and,
// on any failure, returned HTTP 502 with mirrored_to_kv:false — and the KV write
// below never ran. So when the ledger 401'd (Branch C token failure), ALL agent
// journaling died: ATLAS/ECHO/ZEUS could not even write to KV. A substrate AUTH
// failure took down the source of truth.
//
// DOCTRINE: KV is the source of truth; substrate is the immortalization layer.
// The reattest-seals cron exists precisely to immortalize LATER — which only makes
// sense if writes are accepted FIRST. The hard gate defeated that pattern.
//
// THIS HELPER is a PURE decision function: given the outcomes of (1) the KV write
// and (2) the substrate write, it returns the honest response shape + HTTP status.
// It encodes the corrected order's SEMANTICS so they can be unit-tested without
// infra. Callers do: write KV first → attempt substrate → call decideWriteResult().
//
// EPICON-SAFE: this does not change WHAT is written or the EPICON promotion
// criteria. It only changes how a substrate FAILURE is reported (accept to KV +
// flag canonical:false, instead of 502 + data loss). A successful substrate write
// is unchanged: canonical:true, 200.

import { kvSet } from '@/lib/kv/store';
import { isBudgetSuspensionError } from './kv-errors';

export type KvSetResult = { ok: boolean; kv_suspended?: boolean; error?: string };

/**
 * Write a KV key, swallowing budget-suspension errors so callers never 5xx
 * on a budget cap. All other errors are re-thrown.
 */
export async function resilientSet(
  key: string,
  value: unknown,
  ttlSeconds?: number,
): Promise<KvSetResult> {
  try {
    await kvSet(key, value, ttlSeconds);
    return { ok: true };
  } catch (err) {
    if (isBudgetSuspensionError(err)) {
      console.warn(`[resilientSet] KV suspended — skipping write for key "${key}"`);
      return { ok: false, kv_suspended: true };
    }
    throw err;
  }
}

export type SubstrateOutcome =
  | { ok: true; entryId?: string }
  | { ok: false; error?: string };

export type KvOutcome = { ok: boolean; error?: string };

export type ResilientWriteResult = {
  status: number;
  body: {
    ok: boolean;
    canonical: boolean;
    mirrored_to_kv: boolean;
    entry_id?: string;
    substrate_error?: string;
    kv_error?: string;
    /** true when accepted to KV but not yet immortalized — reattest will retry. */
    pending_immortalization?: boolean;
  };
};

/**
 * Decide the journal/ledger write response from the two layer outcomes.
 *
 * Rules:
 * - KV ok + substrate ok  -> 200, canonical:true (fully immortalized).
 * - KV ok + substrate fail -> 200, canonical:false, pending_immortalization:true.
 *   The entry SURVIVES; reattest-seals immortalizes it once the token is fixed.
 *   This is the cascade fix — a substrate failure no longer loses the write.
 * - KV fail + substrate ok -> 200, canonical:true, kv_error noted (rare; ledger
 *   has it, KV mirror lagged — still a success because the source of record landed
 *   in substrate).
 * - KV fail + substrate fail -> 502, ok:false. BOTH layers failed; nothing was
 *   persisted, so this is a real error worth surfacing loudly.
 */
export function decideWriteResult(
  kv: KvOutcome,
  substrate: SubstrateOutcome,
  entryId?: string,
): ResilientWriteResult {
  const substrateOk = substrate.ok;
  const kvOk = kv.ok;

  if (!kvOk && !substrateOk) {
    return {
      status: 502,
      body: {
        ok: false,
        canonical: false,
        mirrored_to_kv: false,
        substrate_error: substrate.ok ? undefined : substrate.error ?? 'substrate_write_failed',
        kv_error: kv.error ?? 'kv_write_failed',
      },
    };
  }

  if (kvOk && !substrateOk) {
    // The cascade fix: accept to KV, flag not-yet-canonical, let reattest retry.
    return {
      status: 200,
      body: {
        ok: true,
        canonical: false,
        mirrored_to_kv: true,
        entry_id: entryId,
        substrate_error: substrate.ok ? undefined : substrate.error ?? 'substrate_write_failed',
        pending_immortalization: true,
      },
    };
  }

  // substrateOk true (kv may have lagged) -> canonical success.
  return {
    status: 200,
    body: {
      ok: true,
      canonical: true,
      mirrored_to_kv: kvOk,
      entry_id: entryId,
      ...(kvOk ? {} : { kv_error: kv.error ?? 'kv_mirror_lagged' }),
    },
  };
}
