/**
 * Vault v1 — reserve accrual from agent journals (no Fountain activation yet).
 * Reserve units are not spendable MIC; they accumulate until a future protocol phase.
 *
 * Vault v2 accrual runs from `writeVaultDeposit(..., { v2Accrual })` so any path that
 * persists a v1 deposit also updates `vault:in_progress_balance` / seal candidates.
 * `recordVaultDepositsForCouncil` passes `v2Accrual` automatically.
 */

import { Redis } from '@upstash/redis';
import type { AgentJournalEntry } from '@/lib/terminal/types';
import {
  backupRawLrange,
  scheduleBackupMirrorVaultDepositsLpush,
} from '@/lib/kv/backup-redis';
import { kvGet, kvSet, loadGIState } from '@/lib/kv/store';
import { accrueDepositV2 } from '@/lib/vault-v2/deposit';

const BALANCE_KEY = 'vault:global:balance';
const META_KEY = 'vault:global:meta';
/** Raw list key (matches MII / epicon pattern — not mobius-prefixed for LPUSH). */
const DEPOSITS_LIST_KEY = 'vault:deposits';
const DEPOSITS_MAX = 200;

const ACTIVATION_THRESHOLD = 50;
const GI_THRESHOLD = 0.95;
const SUSTAIN_CYCLES_REQUIRED = 5;
const PREVIEW_GI = 0.88;

/** When set, `writeVaultDeposit` runs Vault v2 `accrueDepositV2` after v1 persists (single hook for all deposit paths). */
export type WriteVaultDepositOptions = {
  v2Accrual?: {
    cycle: string;
    agent_entry?: AgentJournalEntry;
  };
};

export type VaultDeposit = {
  event_type: 'vault_deposit';
  journal_id: string;
  vault_id: 'vault-global';
  agent: string;
  deposit_amount: number;
  journal_score: number;
  gi_at_deposit: number;
  timestamp: string;
  status: 'sealed';
  /** Normalized text fingerprint for v1 duplication decay (not spendable MIC). */
  content_signature: string;
};

export type VaultState = {
  vault_id: 'vault-global';
  activation_threshold: number;
  gi_threshold: number;
  sustain_cycles_required: number;
  source_entries: number;
  last_deposit: string | null;
  updated_at: string;
};

export type JournalScoreBreakdown = {
  Q: number;
  N: number;
  C: number;
  I: number;
  S: number;
  D: number;
  J: number;
};

function getRedis(): Redis | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    return new Redis({ url, token });
  } catch {
    return null;
  }
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function textSig(entry: AgentJournalEntry): string {
  return `${entry.observation}|${entry.inference}|${entry.recommendation}`.slice(0, 400).toLowerCase();
}

/**
 * v1 scoring: multiplicative core with a floor so honest low-novelty entries still accrue a small reserve.
 */
export function scoreJournal(entry: AgentJournalEntry, recentSignatures: string[]): JournalScoreBreakdown {
  const Q = clamp01(entry.confidence);
  const text = textSig(entry);
  const dupCount = recentSignatures.filter((s) => s === text).length;
  const N = dupCount === 0 ? 0.85 : clamp01(0.85 / (1 + dupCount * 1.4));
  const C = 0.5;
  const I = 0.5;
  const S = 1.0;
  const D = dupCount === 0 ? 1.0 : clamp01(1 / (1 + dupCount * 0.5));
  const multiplicative = Q * N * C * I * S * D;
  const floor = 0.15;
  const J = Math.max(floor, multiplicative);
  return { Q, N, C, I, S, D, J: clamp01(J) };
}

export function computeVaultDeposit(entry: AgentJournalEntry, gi: number, recentSignatures: string[]): number {
  const { J } = scoreJournal(entry, recentSignatures);
  const Wg = Math.max(0.25, Math.min(1.0, gi / 0.95));
  const amount = 1.0 * J * Wg * 1.0;
  return Number(amount.toFixed(6));
}

function parseDepositRow(raw: string | unknown): VaultDeposit | null {
  try {
    const o = typeof raw === 'string' ? (JSON.parse(raw) as VaultDeposit) : (raw as unknown as VaultDeposit);
    if (!o || o.event_type !== 'vault_deposit') return null;
    if (
      typeof o.agent !== 'string' ||
      typeof o.journal_id !== 'string' ||
      typeof o.timestamp !== 'string' ||
      typeof o.deposit_amount !== 'number'
    ) {
      return null;
    }
    if (!Number.isFinite(o.deposit_amount)) return null;
    return o;
  } catch {
    return null;
  }
}

/**
 * Newest-first raw deposit rows from `vault:deposits` (same list as LPUSH in
 * `writeVaultDeposit`, capped at DEPOSITS_MAX).
 */
export async function listVaultDeposits(limit = DEPOSITS_MAX): Promise<VaultDeposit[]> {
  const cap = Math.max(1, Math.min(DEPOSITS_MAX, Math.floor(limit)));
  const parseRows = (rows: unknown[]): VaultDeposit[] => {
    const out: VaultDeposit[] = [];
    for (const row of rows) {
      const d = parseDepositRow(row);
      if (d) out.push(d);
    }
    return out;
  };

  const redis = getRedis();
  if (!redis) {
    return parseRows(await backupRawLrange(DEPOSITS_LIST_KEY, 0, cap - 1));
  }
  try {
    const raw = await redis.lrange<string>(DEPOSITS_LIST_KEY, 0, cap - 1);
    const fromPrimary = parseRows(raw as unknown[]);
    if (fromPrimary.length > 0) return fromPrimary;
    return parseRows(await backupRawLrange(DEPOSITS_LIST_KEY, 0, cap - 1));
  } catch {
    return parseRows(await backupRawLrange(DEPOSITS_LIST_KEY, 0, cap - 1));
  }
}

export async function getRecentContentSignatures(limit: number): Promise<string[]> {
  const deposits = await listVaultDeposits(Math.max(1, Math.min(DEPOSITS_MAX, limit)));
  return deposits.map((d) => d.content_signature);
}

export async function writeVaultDeposit(
  deposit: VaultDeposit,
  opts?: WriteVaultDepositOptions,
): Promise<void> {
  const redis = getRedis();
  const prevBalance = (await kvGet<number>(BALANCE_KEY)) ?? 0;
  const nextBalance = Number((prevBalance + deposit.deposit_amount).toFixed(6));

  await kvSet(BALANCE_KEY, nextBalance);

  const now = new Date().toISOString();
  const prevMeta = await kvGet<VaultState>(META_KEY);
  const sourceEntries = (prevMeta?.source_entries ?? 0) + 1;

  const meta: VaultState = {
    vault_id: 'vault-global',
    activation_threshold: ACTIVATION_THRESHOLD,
    gi_threshold: GI_THRESHOLD,
    sustain_cycles_required: SUSTAIN_CYCLES_REQUIRED,
    source_entries: sourceEntries,
    last_deposit: deposit.timestamp,
    updated_at: now,
  };
  await kvSet(META_KEY, meta);

  if (redis) {
    try {
      const row = JSON.stringify(deposit);
      await redis.lpush(DEPOSITS_LIST_KEY, row);
      await redis.ltrim(DEPOSITS_LIST_KEY, 0, DEPOSITS_MAX - 1);
      scheduleBackupMirrorVaultDepositsLpush(DEPOSITS_LIST_KEY, row, DEPOSITS_MAX);
    } catch (err) {
      console.error('[vault] deposit list write failed:', err instanceof Error ? err.message : err);
    }
  }

  const v2 = opts?.v2Accrual;
  if (v2) {
    try {
      const r = await accrueDepositV2({
        deposit_amount: deposit.deposit_amount,
        content_signature: deposit.content_signature,
        cycle: v2.cycle,
        agent_entry: v2.agent_entry,
      });
      console.info('[vault-v2] accrue after v1 write', {
        journal_id: deposit.journal_id,
        agent: deposit.agent,
        deposit_amount: deposit.deposit_amount,
        balance_after: r.balance_after,
        candidate_formed: Boolean(r.candidate_formed),
        candidate_deferred: r.candidate_deferred,
        overflow: r.overflow,
      });
    } catch (err) {
      console.warn(
        '[vault-v2] accrueDepositV2 failed (non-fatal):',
        err instanceof Error ? err.message : err,
      );
    }
  }
}

export type VaultStatusPayload = {
  ok: true;
  vault_id: 'vault-global';
  balance_reserve: number;
  activation_threshold: number;
  gi_threshold: number;
  sustain_cycles_required: number;
  status: 'sealed' | 'preview' | 'activating';
  preview_active: boolean;
  source_entries: number;
  last_deposit: string | null;
  gi_current: number | null;
  timestamp: string;
};

export async function getVaultStatusPayload(giCurrent: number | null): Promise<VaultStatusPayload> {
  const balance = (await kvGet<number>(BALANCE_KEY)) ?? 0;
  const meta = await kvGet<VaultState>(META_KEY);
  const gi = giCurrent !== null && Number.isFinite(giCurrent) ? Math.max(0, Math.min(1, giCurrent)) : null;

  const preview_active = gi !== null && gi >= PREVIEW_GI;
  const activating = gi !== null && gi >= GI_THRESHOLD && balance >= ACTIVATION_THRESHOLD;

  let status: VaultStatusPayload['status'] = 'sealed';
  if (activating) status = 'activating';
  else if (preview_active) status = 'preview';

  return {
    ok: true,
    vault_id: 'vault-global',
    balance_reserve: balance,
    activation_threshold: ACTIVATION_THRESHOLD,
    gi_threshold: GI_THRESHOLD,
    sustain_cycles_required: SUSTAIN_CYCLES_REQUIRED,
    status,
    preview_active,
    source_entries: meta?.source_entries ?? 0,
    last_deposit: meta?.last_deposit ?? null,
    gi_current: gi,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Sequential vault accrual for a batch of council journals (single GI snapshot).
 */
export async function recordVaultDepositsForCouncil(
  entries: AgentJournalEntry[],
  gi: number,
): Promise<{ attempted: number; errors: number; deposited: number }> {
  let attempted = 0;
  let errors = 0;
  let deposited = 0;
  const recentSigs = await getRecentContentSignatures(120);

  for (const entry of entries) {
    attempted += 1;
    try {
      const sig = textSig(entry);
      const recentForScore = [...recentSigs];
      const amount = computeVaultDeposit(entry, gi, recentForScore);
      recentSigs.push(sig);
      if (amount <= 0) continue;

      const deposit: VaultDeposit = {
        event_type: 'vault_deposit',
        journal_id: entry.id,
        vault_id: 'vault-global',
        agent: entry.agent,
        deposit_amount: amount,
        journal_score: scoreJournal(entry, recentForScore).J,
        gi_at_deposit: Number(gi.toFixed(4)),
        timestamp: new Date().toISOString(),
        status: 'sealed',
        content_signature: sig,
      };
      await writeVaultDeposit(deposit, {
        v2Accrual: {
          cycle: entry.cycle ?? 'C-?',
          agent_entry: entry,
        },
      });

      deposited += 1;
    } catch {
      errors += 1;
    }
  }

  return { attempted, errors, deposited };
}

/**
 * Fire-and-forget vault accrual after any committed journal append (cron, manual, council).
 */
export function scheduleVaultDepositForJournal(entry: AgentJournalEntry): void {
  void (async () => {
    try {
      let gi = 0.74;
      try {
        const st = await loadGIState();
        if (st && typeof st.global_integrity === 'number' && Number.isFinite(st.global_integrity)) {
          gi = Math.max(0, Math.min(1, st.global_integrity));
        }
      } catch {
        // default gi
      }
      const r = await recordVaultDepositsForCouncil([entry], gi);
      if (r.deposited > 0) {
        console.info('[vault] journal deposit', { journal_id: entry.id, agent: entry.agent, ...r, gi });
      }
    } catch (err) {
      console.error('[vault] scheduleVaultDepositForJournal failed:', err instanceof Error ? err.message : err);
    }
  })();
}
