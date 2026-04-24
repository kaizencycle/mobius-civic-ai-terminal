export type DvaMode = 'lite' | 'one' | 'full';

type LiteLaneFreshness = 'fresh' | 'nominal' | 'stale' | 'degraded' | 'unknown';

type SnapshotLitePayload = {
  ok?: boolean;
  cycle?: string;
  timestamp?: string;
  gi?: number | null;
  mode?: string | null;
  degraded?: boolean;
  lanes?: {
    integrity?: {
      gi?: number | null;
      mode?: string | null;
      terminal_status?: string | null;
      freshness?: LiteLaneFreshness;
    };
    signals?: {
      anomalies?: number | null;
      freshness?: LiteLaneFreshness;
    };
    pulse?: {
      instruments?: number | null;
      anomalies?: number | null;
      freshness?: LiteLaneFreshness;
    };
    tripwire?: {
      count?: number | null;
      elevated?: boolean;
    };
    echo?: {
      freshness?: LiteLaneFreshness;
    };
  };
  heartbeat?: {
    runtime?: string | null;
    journal?: string | null;
  };
};

type AgentStatusRow = {
  name?: string;
  status?: string;
  liveness?: string;
  last_journal_at?: string | null;
  last_seen?: string | null;
};

type JournalEntry = {
  cycle?: string;
  timestamp?: string;
  observation?: string;
};

type PromotionCounts = {
  pending: number;
  promoted: number;
  contested: number;
};

type VaultPreviewInput = {
  balance_reserve?: number;
  current_tranche_balance?: number;
  fountain_status?: string;
};

export type EchoDigestPayload = {
  ok: true;
  cycle: string;
  timestamp: string;
  dva_mode: DvaMode;
  source: 'echo-digest';
  degraded: boolean;
  integrity: {
    gi: number | null;
    mode: string;
    status: string;
  };
  summary: {
    headline: string;
    top_warnings: string[];
  };
  signals_preview: {
    instrument_count: number;
    anomalies: number;
    freshness: LiteLaneFreshness;
    top_agents: string[];
  };
  journal_preview: {
    mode: 'hot';
    latest_count: number;
    cycles: Array<{ cycle: string; count: number }>;
    archive_stale: boolean;
  };
  ledger_preview: {
    rows: number;
    pending: number;
    promoted: number;
    contested: number;
    status: 'live' | 'degraded';
  };
  agents_preview: {
    active_like: number;
    booting: number;
    heartbeat_stale: string[];
  };
  vault_preview: {
    reserve: number | null;
    tranche: number | null;
    fountain_locked: boolean;
  };
  predictive: {
    risk_level: 'nominal' | 'watch' | 'elevated' | 'critical';
    signals: string[];
    recommendation: string;
  };
};

function countByCycle(entries: JournalEntry[]): Array<{ cycle: string; count: number }> {
  const bucket = new Map<string, number>();
  for (const row of entries) {
    const cycle = typeof row.cycle === 'string' && row.cycle.trim().length > 0 ? row.cycle.trim() : 'C-—';
    bucket.set(cycle, (bucket.get(cycle) ?? 0) + 1);
  }
  return [...bucket.entries()]
    .map(([cycle, count]) => ({ cycle, count }))
    .sort((a, b) => b.cycle.localeCompare(a.cycle))
    .slice(0, 3);
}

function buildHeadline(args: {
  degraded: boolean;
  archiveStale: boolean;
  ledgerDegraded: boolean;
}): string {
  if (args.degraded && args.archiveStale) return 'System degraded but stable. Snapshot live. Archive partial.';
  if (args.degraded) return 'System degraded. Snapshot lanes remain operator-authoritative.';
  if (args.archiveStale) return 'System stable with stale archive lane. Hot lane is authoritative.';
  if (args.ledgerDegraded) return 'System stable with partial ledger lane. Promotion counts may lag.';
  return 'System stable. Snapshot and chamber preview lanes are coherent.';
}

function detectDvaMode(args: {
  agents: AgentStatusRow[];
  snapshotLite: SnapshotLitePayload;
}): DvaMode {
  const { agents, snapshotLite } = args;
  const fresh = (v: LiteLaneFreshness | undefined) => v === 'fresh' || v === 'nominal';
  const hasEcho = Boolean(snapshotLite.ok !== false);
  const hasAtlas = agents.some((a) => (a.name ?? '').toUpperCase() === 'ATLAS' && (a.status ?? '').toLowerCase() === 'active');
  const hasZeus = agents.some((a) => (a.name ?? '').toUpperCase() === 'ZEUS' && (a.status ?? '').toLowerCase() === 'active');
  const hasHermes = agents.some((a) => (a.name ?? '').toUpperCase() === 'HERMES' && (a.status ?? '').toLowerCase() === 'active');
  const atlasFresh = fresh(snapshotLite.lanes?.integrity?.freshness);
  const zeusFresh = fresh(snapshotLite.lanes?.signals?.freshness);
  const hermesFresh = fresh(snapshotLite.lanes?.echo?.freshness);

  if (hasEcho && hasAtlas && hasZeus && hasHermes && atlasFresh && zeusFresh && hermesFresh) return 'full';
  if (hasEcho && hasAtlas && atlasFresh) return 'one';
  return 'lite';
}

export function buildEchoDigest(input: {
  snapshotLite: SnapshotLitePayload;
  agents: AgentStatusRow[];
  journalEntries: JournalEntry[];
  promotion: PromotionCounts;
  vault: VaultPreviewInput | null;
}): EchoDigestPayload {
  const { snapshotLite, agents, journalEntries, promotion, vault } = input;
  const cycle = snapshotLite.cycle ?? 'C-—';
  const timestamp = new Date().toISOString();
  const gi = typeof snapshotLite.gi === 'number' ? snapshotLite.gi : snapshotLite.lanes?.integrity?.gi ?? null;
  const mode = snapshotLite.mode ?? snapshotLite.lanes?.integrity?.mode ?? 'yellow';
  const status = snapshotLite.lanes?.integrity?.terminal_status ?? 'stressed';

  const activeLike = agents.filter((a) => ['active', 'degraded'].includes((a.status ?? '').toLowerCase())).length;
  const booting = agents.filter((a) => (a.status ?? '').toLowerCase() === 'booting').length;
  const heartbeatStale = agents
    .filter((a) => {
      const s = (a.status ?? '').toLowerCase();
      return s === 'offline' || s === 'contested' || s === 'booting';
    })
    .map((a) => a.name)
    .filter((name): name is string => typeof name === 'string' && name.length > 0)
    .slice(0, 6);

  const cycles = countByCycle(journalEntries);
  const latestCount = Math.min(journalEntries.length, 8);
  const archiveStale = Boolean(snapshotLite.lanes?.echo?.freshness === 'stale' || snapshotLite.lanes?.echo?.freshness === 'degraded');
  const ledgerRows = promotion.pending + promotion.promoted + promotion.contested;
  const ledgerDegraded = ledgerRows === 0;
  const degraded =
    Boolean(snapshotLite.degraded) ||
    ledgerDegraded ||
    Boolean(snapshotLite.lanes?.tripwire?.elevated) ||
    status.toLowerCase() === 'stressed';

  const integrityLaneGi = typeof snapshotLite.lanes?.integrity?.gi === 'number' ? snapshotLite.lanes.integrity.gi : null;
  const divergence = typeof snapshotLite.gi === 'number' && typeof integrityLaneGi === 'number'
    ? Math.abs(snapshotLite.gi - integrityLaneGi)
    : 0;
  const hydrationDrift = snapshotLite.lanes?.signals?.freshness === 'stale' || snapshotLite.lanes?.signals?.freshness === 'degraded';
  const anomalyCount = Number(snapshotLite.lanes?.signals?.anomalies ?? 0);
  const digestInstabilityScore = [
    degraded,
    ledgerDegraded,
    anomalyCount >= 5,
    booting > activeLike,
    archiveStale,
  ].filter(Boolean).length;
  const atlasStalled = agents.some((a) => (a.name ?? '').toUpperCase() === 'ATLAS' && (a.status ?? '').toLowerCase() === 'booting');
  const zeusStalled = agents.some((a) => (a.name ?? '').toUpperCase() === 'ZEUS' && (a.status ?? '').toLowerCase() === 'booting');
  const agentStallDetected = atlasStalled || zeusStalled || booting > activeLike;
  const riskLevel: EchoDigestPayload['predictive']['risk_level'] = divergence > 0.35 || digestInstabilityScore >= 4
    ? 'critical'
    : divergence > 0.2 || hydrationDrift || digestInstabilityScore >= 2 || agentStallDetected
      ? 'elevated'
      : digestInstabilityScore >= 1
        ? 'watch'
        : 'nominal';

  const warnings: string[] = [];
  if (archiveStale) warnings.push('Journal archive stale; hot lane authoritative');
  if (ledgerDegraded) warnings.push('Ledger rows unavailable');
  if (!snapshotLite.heartbeat?.journal) warnings.push('Heartbeat journal cycle lagging');
  if (snapshotLite.lanes?.tripwire?.elevated) warnings.push('Tripwire elevated; promotion should remain guarded');

  return {
    ok: true,
    cycle,
    timestamp,
    dva_mode: detectDvaMode({ agents, snapshotLite }),
    source: 'echo-digest',
    degraded,
    integrity: {
      gi,
      mode: typeof mode === 'string' ? mode : 'yellow',
      status,
    },
    summary: {
      headline: buildHeadline({ degraded, archiveStale, ledgerDegraded }),
      top_warnings: warnings.slice(0, 4),
    },
    signals_preview: {
      instrument_count: Number(snapshotLite.lanes?.pulse?.instruments ?? 0),
      anomalies: Number(snapshotLite.lanes?.pulse?.anomalies ?? snapshotLite.lanes?.signals?.anomalies ?? 0),
      freshness: snapshotLite.lanes?.signals?.freshness ?? 'unknown',
      top_agents: agents.slice(0, 3).map((a) => a.name).filter((a): a is string => typeof a === 'string' && a.length > 0),
    },
    journal_preview: {
      mode: 'hot',
      latest_count: latestCount,
      cycles,
      archive_stale: archiveStale,
    },
    ledger_preview: {
      rows: ledgerRows,
      pending: promotion.pending,
      promoted: promotion.promoted,
      contested: promotion.contested,
      status: ledgerDegraded ? 'degraded' : 'live',
    },
    agents_preview: {
      active_like: activeLike,
      booting,
      heartbeat_stale: heartbeatStale,
    },
    vault_preview: {
      reserve: typeof vault?.balance_reserve === 'number' ? vault.balance_reserve : null,
      tranche: typeof vault?.current_tranche_balance === 'number' ? vault.current_tranche_balance : null,
      fountain_locked: (vault?.fountain_status ?? 'locked') !== 'active' && (vault?.fountain_status ?? 'locked') !== 'unsealed',
    },
    predictive: {
      risk_level: riskLevel,
      signals: [
        divergence > 0.2 ? 'divergence_detected' : null,
        hydrationDrift ? 'hydration_drift' : null,
        digestInstabilityScore >= 2 ? 'digest_instability' : null,
        ledgerDegraded ? 'ledger_stall' : null,
        agentStallDetected ? 'agent_stall_detected' : null,
      ].filter((v): v is string => Boolean(v)),
      recommendation:
        riskLevel === 'critical'
          ? 'lock preview, pause chamber promotion, and prioritize lane recovery'
          : riskLevel === 'elevated'
            ? 'lock preview, delay hydration promotion'
            : riskLevel === 'watch'
              ? 'bias snapshot authority and monitor lane freshness'
              : 'normal operation',
    },
  };
}
