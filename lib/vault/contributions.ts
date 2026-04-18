import type { VaultDeposit } from '@/lib/vault/vault';

/** Extract cycle id from common journal id shapes (e.g. `journal-ATLAS-C-285-abc`, `ZEUS-C-285-123`). */
export function parseCycleFromJournalId(journalId: string): string | null {
  const m = journalId.match(/(C-\d+)/i);
  if (!m) return null;
  const raw = m[1];
  if (/^c-/i.test(raw) && raw.length > 2) return `C-${raw.slice(2)}`;
  return raw;
}

export type AgentContributionRow = {
  agent: string;
  total_reserve_contributed: number;
  deposit_count: number;
  avg_deposit_per_entry: number;
  last_deposit_at: string | null;
  last_journal_id: string | null;
};

export type CycleContributionRow = {
  cycle: string;
  total_reserve_contributed: number;
  deposit_count: number;
  avg_deposit_per_entry: number;
  last_deposit_at: string | null;
};

export type ContributionAggregates = {
  rows_scanned: number;
  /** Mean journal_score over deposits that had a finite score. */
  avg_journal_score: number | null;
  /** Mean Wg = deposit / journal_score where journal_score > 0. */
  avg_gi_weight_factor: number | null;
  /** Mean N over deposits with replay-derived N,D (see buildDepositReplayMetrics). */
  avg_novelty_factor: number | null;
  /** Mean D factor. */
  avg_duplication_decay: number | null;
  /** Deposits where content_signature matched a prior deposit in this scan window (newest-first order). */
  deposits_after_first_signature_repeat: number;
};

export type DepositReplayRow = VaultDeposit & {
  /** Novelty factor N from v1 scoring (dup count in prior tail). */
  novelty_n: number;
  /** Duplication decay D. */
  duplication_d: number;
};

/**
 * Recompute N and D for each deposit as if deposits were applied oldest-first within the list
 * (list is newest-first from Redis; we walk from end to start).
 */
export function buildDepositReplayMetrics(deposits: VaultDeposit[]): DepositReplayRow[] {
  const chronological = [...deposits].reverse();
  const sigCounts = new Map<string, number>();
  const out: DepositReplayRow[] = [];

  for (const d of chronological) {
    const sig = d.content_signature;
    const dupCount = sigCounts.get(sig) ?? 0;
    sigCounts.set(sig, dupCount + 1);

    const N = dupCount === 0 ? 0.85 : Math.max(0, Math.min(1, 0.85 / (1 + dupCount * 1.4)));
    const D = dupCount === 0 ? 1.0 : Math.max(0, Math.min(1, 1 / (1 + dupCount * 0.5)));

    out.push({
      ...d,
      novelty_n: N,
      duplication_d: D,
    });
  }

  // Map back to newest-first order to align with deposits array index
  return out.reverse();
}

function meanFinite(values: number[]): number | null {
  const xs = values.filter((n) => Number.isFinite(n));
  if (xs.length === 0) return null;
  return Number((xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(6));
}

export function computeContributionAggregates(
  deposits: VaultDeposit[],
  replay: DepositReplayRow[],
): ContributionAggregates {
  const journalScores = deposits.map((d) => d.journal_score).filter((n) => typeof n === 'number' && Number.isFinite(n));
  const wg = deposits
    .map((d) => (d.journal_score > 0 ? d.deposit_amount / d.journal_score : NaN))
    .filter((n) => Number.isFinite(n));

  let repeats = 0;
  const seen = new Set<string>();
  for (const d of deposits) {
    if (seen.has(d.content_signature)) repeats += 1;
    else seen.add(d.content_signature);
  }

  return {
    rows_scanned: deposits.length,
    avg_journal_score: meanFinite(journalScores),
    avg_gi_weight_factor: meanFinite(wg),
    avg_novelty_factor: meanFinite(replay.map((r) => r.novelty_n)),
    avg_duplication_decay: meanFinite(replay.map((r) => r.duplication_d)),
    deposits_after_first_signature_repeat: repeats,
  };
}

export function aggregateByAgent(
  deposits: VaultDeposit[],
  replay: DepositReplayRow[],
  filterCycle: string | null,
): { agents: AgentContributionRow[]; aggregates: ContributionAggregates } {
  const byAgent = new Map<string, AgentContributionRow>();
  const filtered: VaultDeposit[] = [];
  const filteredReplay: DepositReplayRow[] = [];

  for (let i = 0; i < deposits.length; i++) {
    const d = deposits[i];
    const cyc = parseCycleFromJournalId(d.journal_id);
    if (filterCycle && cyc !== filterCycle.trim()) continue;
    filtered.push(d);
    filteredReplay.push(replay[i]);
  }

  for (let i = 0; i < filtered.length; i++) {
    const d = filtered[i];
    const agent = d.agent;
    const prev = byAgent.get(agent);
    const amt = d.deposit_amount;
    if (!prev) {
      byAgent.set(agent, {
        agent,
        total_reserve_contributed: amt,
        deposit_count: 1,
        avg_deposit_per_entry: amt,
        last_deposit_at: d.timestamp,
        last_journal_id: d.journal_id,
      });
    } else {
      prev.total_reserve_contributed = Number((prev.total_reserve_contributed + amt).toFixed(6));
      prev.deposit_count += 1;
      prev.avg_deposit_per_entry = Number((prev.total_reserve_contributed / prev.deposit_count).toFixed(6));
      if (!prev.last_deposit_at || d.timestamp > prev.last_deposit_at) {
        prev.last_deposit_at = d.timestamp;
        prev.last_journal_id = d.journal_id;
      }
    }
  }

  const agents = [...byAgent.values()].sort((a, b) =>
    b.total_reserve_contributed - a.total_reserve_contributed || a.agent.localeCompare(b.agent, undefined, { sensitivity: 'base' }),
  );

  return {
    agents,
    aggregates: computeContributionAggregates(filtered, filteredReplay),
  };
}

export function aggregateByCycle(
  deposits: VaultDeposit[],
  replay: DepositReplayRow[],
  filterCycle: string | null,
): { cycles: CycleContributionRow[]; aggregates: ContributionAggregates } {
  const byCycle = new Map<string, CycleContributionRow>();
  const filtered: VaultDeposit[] = [];
  const filteredReplay: DepositReplayRow[] = [];

  for (let i = 0; i < deposits.length; i++) {
    const d = deposits[i];
    const cyc = parseCycleFromJournalId(d.journal_id) ?? 'unknown';
    if (filterCycle && cyc !== filterCycle.trim()) continue;
    filtered.push(d);
    filteredReplay.push(replay[i]);
  }

  for (let i = 0; i < filtered.length; i++) {
    const d = filtered[i];
    const cycle = parseCycleFromJournalId(d.journal_id) ?? 'unknown';
    const prev = byCycle.get(cycle);
    const amt = d.deposit_amount;
    if (!prev) {
      byCycle.set(cycle, {
        cycle,
        total_reserve_contributed: amt,
        deposit_count: 1,
        avg_deposit_per_entry: amt,
        last_deposit_at: d.timestamp,
      });
    } else {
      prev.total_reserve_contributed = Number((prev.total_reserve_contributed + amt).toFixed(6));
      prev.deposit_count += 1;
      prev.avg_deposit_per_entry = Number((prev.total_reserve_contributed / prev.deposit_count).toFixed(6));
      if (!prev.last_deposit_at || d.timestamp > prev.last_deposit_at) {
        prev.last_deposit_at = d.timestamp;
      }
    }
  }

  const cycles = [...byCycle.values()].sort((a, b) => {
    const na = parseInt(a.cycle.replace(/\D/g, ''), 10);
    const nb = parseInt(b.cycle.replace(/\D/g, ''), 10);
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return nb - na;
    return b.cycle.localeCompare(a.cycle);
  });

  return {
    cycles,
    aggregates: computeContributionAggregates(filtered, filteredReplay),
  };
}
