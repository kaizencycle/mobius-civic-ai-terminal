/**
 * C-274: Normalized terminal snapshot lane health — single source of truth for
 * `/api/terminal/snapshot` leaves and client render decisions.
 */

export type SnapshotLaneKey =
  | 'integrity'
  | 'signals'
  | 'kvHealth'
  | 'agents'
  | 'epicon'
  | 'echo'
  | 'journal'
  | 'sentiment'
  | 'runtime'
  | 'promotion'
  | 'eve'
  | 'mii'
  | 'vault'
  | 'micReadiness'
  | 'tripwire';

export type SnapshotLaneSemanticState = 'healthy' | 'degraded' | 'offline' | 'stale' | 'empty' | 'promotable';

export type FallbackMode = 'live' | 'cached' | 'empty' | 'offline';

export type SnapshotLaneState = {
  key: SnapshotLaneKey;
  ok: boolean;
  state: SnapshotLaneSemanticState;
  statusCode: number | null;
  message: string;
  lastUpdated: string | null;
  fallbackMode: FallbackMode;
};

export type SnapshotLeaf = {
  ok: boolean;
  status: number;
  data: unknown;
  error: string | null;
};

const STALE_MS_SIGNALS = 5 * 60 * 1000;
const STALE_MS_SENTIMENT = 10 * 60 * 1000;
const STALE_MS_ECHO_INGEST = 2 * 60 * 60 * 1000;

export const SNAPSHOT_LANE_KEYS: readonly SnapshotLaneKey[] = [
  'integrity',
  'signals',
  'kvHealth',
  'agents',
  'epicon',
  'echo',
  'journal',
  'sentiment',
  'runtime',
  'promotion',
  'eve',
  'mii',
  'vault',
  'micReadiness',
  'tripwire',
] as const;

function asRecord(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== 'object') return null;
  return data as Record<string, unknown>;
}

function parseIsoMs(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
}

function ageMs(lastUpdated: string | null): number | null {
  if (!lastUpdated) return null;
  const t = new Date(lastUpdated).getTime();
  if (!Number.isFinite(t)) return null;
  return Date.now() - t;
}

function classifyHttpFailure(status: number, error: string | null): { state: SnapshotLaneSemanticState; message: string } {
  if (status === 401 || status === 403) {
    return { state: 'offline', message: error ?? 'Lane blocked (auth or config)' };
  }
  if (status === 408 || status === 504) {
    return { state: 'degraded', message: error ?? 'Upstream timeout' };
  }
  if (status >= 500) {
    return { state: 'offline', message: error ?? 'Upstream error' };
  }
  if (status === 404) {
    return { state: 'offline', message: error ?? 'Lane endpoint not found' };
  }
  return { state: 'degraded', message: error ?? `HTTP ${status}` };
}

/** Best-effort timestamp for a lane from normalized API payloads */
export function extractLaneLastUpdated(key: SnapshotLaneKey, data: unknown): string | null {
  const row = asRecord(data);
  if (!row) return null;

  const pick = (...keys: string[]): string | null => {
    for (const k of keys) {
      const v = row[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return null;
  };

  switch (key) {
    case 'integrity':
      return pick('timestamp');
    case 'signals':
      return pick('timestamp');
    case 'kvHealth':
      return pick('timestamp');
    case 'agents':
      return pick('timestamp', 'asOf');
    case 'epicon': {
      const summary = asRecord(row.summary);
      const hb = summary && typeof summary.lastHeartbeat === 'string' ? summary.lastHeartbeat : null;
      return hb ?? pick('timestamp');
    }
    case 'echo': {
      const status = asRecord(row.status);
      return status ? (typeof status.lastIngest === 'string' ? status.lastIngest : null) : pick('timestamp');
    }
    case 'journal':
      return pick('timestamp', 'asOf', 'lastArchiveWriteAt');
    case 'sentiment':
      return pick('timestamp', 'cachedAt');
    case 'runtime':
      return pick('freshAt', 'last_run', 'lastRun', 'timestamp');
    case 'promotion': {
      const diag = asRecord(row.diagnostics);
      const d = diag && typeof diag.last_promotion_run_at === 'string' ? diag.last_promotion_run_at : null;
      return d ?? pick('timestamp');
    }
    case 'eve':
      return pick('timestamp');
    case 'mii':
      return pick('timestamp');
    case 'vault':
      return pick('timestamp', 'last_deposit');
    case 'micReadiness':
      return pick('updatedAt', 'timestamp');
    case 'tripwire':
      return pick('last_updated', 'timestamp');
    default:
      return null;
  }
}

function normalizeEpiconLane(leaf: SnapshotLeaf): SnapshotLaneState {
  const lastUpdated = extractLaneLastUpdated('epicon', leaf.data);
  if (!leaf.ok) {
    const { state, message } = classifyHttpFailure(leaf.status, leaf.error);
    return {
      key: 'epicon',
      ok: false,
      state,
      statusCode: leaf.status,
      message,
      lastUpdated,
      fallbackMode: 'offline',
    };
  }
  const row = asRecord(leaf.data);
  const innerOk = row?.ok === true;
  if (!innerOk) {
    return {
      key: 'epicon',
      ok: false,
      state: 'degraded',
      statusCode: leaf.status,
      message: typeof row?.error === 'string' ? row.error : 'EPICON feed returned not ok',
      lastUpdated,
      fallbackMode: 'offline',
    };
  }
  const items = row.items;
  const count = Array.isArray(items) ? items.length : typeof row.count === 'number' ? row.count : 0;
  const committed =
    Array.isArray(items)
      ? items.filter((item) => {
          const r = asRecord(item);
          return String(r?.status ?? '').toLowerCase() === 'committed';
        }).length
      : 0;
  if (count === 0) {
    return {
      key: 'epicon',
      ok: true,
      state: 'empty',
      statusCode: leaf.status,
      message: 'EPICON feed returned no rows (empty dataset)',
      lastUpdated,
      fallbackMode: 'empty',
    };
  }
  if (committed === 0) {
    // Candidates exist in the pipeline but none have been promoted yet — this
    // is not "empty"; it is an active promotable queue awaiting commit.
    return {
      key: 'epicon',
      ok: true,
      state: 'promotable',
      statusCode: leaf.status,
      message: `${count} EPICON candidate${count === 1 ? '' : 's'} active · awaiting promotion commit`,
      lastUpdated,
      fallbackMode: 'empty',
    };
  }
  return {
    key: 'epicon',
    ok: true,
    state: 'healthy',
    statusCode: leaf.status,
    message: `${committed} committed row(s) in feed`,
    lastUpdated,
    fallbackMode: 'live',
  };
}

function normalizeJournalLane(leaf: SnapshotLeaf): SnapshotLaneState {
  const lastUpdated = extractLaneLastUpdated('journal', leaf.data);
  if (!leaf.ok) {
    const { state, message } = classifyHttpFailure(leaf.status, leaf.error);
    return {
      key: 'journal',
      ok: false,
      state,
      statusCode: leaf.status,
      message,
      lastUpdated,
      fallbackMode: 'offline',
    };
  }
  const row = asRecord(leaf.data);
  if (row?.ok !== true) {
    return {
      key: 'journal',
      ok: false,
      state: row?.ok === false && leaf.status === 200 ? 'offline' : 'degraded',
      statusCode: leaf.status,
      message: typeof row?.error === 'string' ? row.error : 'Journal API not ok',
      lastUpdated,
      fallbackMode: 'offline',
    };
  }
  const entries = row.entries;
  const count = Array.isArray(entries) ? entries.length : typeof row.count === 'number' ? row.count : 0;
  const merged = Boolean(row.merged_from_archive);
  const archiveError = typeof row.archive_error === 'string' ? row.archive_error : null;
  const archiveStale = Boolean(row.archive_stale);

  let state: SnapshotLaneSemanticState = 'healthy';
  let message = `${count} journal entr${count === 1 ? 'y' : 'ies'}${merged ? ' · hot + archive' : ' (hot lane)'}`;
  let fallbackMode: FallbackMode = 'live';

  if (count === 0) {
    state = 'empty';
    message = 'No journal rows for current filter';
    fallbackMode = 'empty';
  }
  if (archiveError) {
    state = 'degraded';
    message = `Archive unreachable (${archiveError}); showing hot-lane only`;
    fallbackMode = 'cached';
  } else if (archiveStale) {
    state = 'stale';
    message = 'Archive merge may be stale; hot lane is authoritative';
    fallbackMode = 'cached';
  }

  return {
    key: 'journal',
    ok: true,
    state,
    statusCode: leaf.status,
    message,
    lastUpdated,
    fallbackMode,
  };
}

function normalizeSentimentLane(leaf: SnapshotLeaf): SnapshotLaneState {
  const lastUpdated = extractLaneLastUpdated('sentiment', leaf.data);
  if (!leaf.ok) {
    const { state, message } = classifyHttpFailure(leaf.status, leaf.error);
    return {
      key: 'sentiment',
      ok: false,
      state,
      statusCode: leaf.status,
      message,
      lastUpdated,
      fallbackMode: 'offline',
    };
  }
  const row = asRecord(leaf.data);
  if (row?.ok !== true) {
    return {
      key: 'sentiment',
      ok: false,
      state: 'degraded',
      statusCode: leaf.status,
      message: typeof row?.error === 'string' ? row.error : 'Sentiment composite not ok',
      lastUpdated,
      fallbackMode: 'offline',
    };
  }
  const age = ageMs(lastUpdated);
  let state: SnapshotLaneSemanticState = 'healthy';
  if (age !== null && age > STALE_MS_SENTIMENT) state = 'stale';

  const domains = row.domains;
  const domainCount = Array.isArray(domains) ? domains.length : 0;
  const nullScores =
    Array.isArray(domains)
      ? domains.filter((d) => asRecord(d)?.score === null || asRecord(d)?.score === undefined).length
      : 0;

  let message = `Composite · ${domainCount} domain(s)`;
  if (state === 'stale') message = `Snapshot stale (${Math.round((age ?? 0) / 60000)}m); ${message.toLowerCase()}`;
  if (domainCount > 0 && nullScores === domainCount) {
    state = state === 'healthy' ? 'empty' : state;
    message = 'All domain scores null (upstream sparse)';
  }

  return {
    key: 'sentiment',
    ok: true,
    state,
    statusCode: leaf.status,
    message,
    lastUpdated,
    fallbackMode: state === 'stale' ? 'cached' : 'live',
  };
}

function normalizeRuntimeLane(leaf: SnapshotLeaf): SnapshotLaneState {
  const lastUpdated = extractLaneLastUpdated('runtime', leaf.data);
  if (!leaf.ok) {
    const { state, message } = classifyHttpFailure(leaf.status, leaf.error);
    return {
      key: 'runtime',
      ok: false,
      state,
      statusCode: leaf.status,
      message,
      lastUpdated,
      fallbackMode: 'offline',
    };
  }
  const row = asRecord(leaf.data);
  if (row?.ok !== true) {
    return {
      key: 'runtime',
      ok: false,
      state: 'offline',
      statusCode: leaf.status,
      message: typeof row?.error === 'string' ? row.error : 'Runtime status not ok',
      lastUpdated,
      fallbackMode: 'offline',
    };
  }
  const degraded = Boolean(row.degraded);
  const freshness = asRecord(row.freshness);
  const status = typeof freshness?.status === 'string' ? freshness.status : '';
  const seconds = typeof freshness?.seconds === 'number' ? freshness.seconds : null;

  let state: SnapshotLaneSemanticState = 'healthy';
  if (status === 'stale' || (seconds !== null && seconds > 3600)) state = 'stale';
  if (status === 'degraded' || degraded) state = 'degraded';

  const source = typeof row.source === 'string' ? row.source : '';
  let message = `Runtime ${source || 'status'} · freshness ${status || 'unknown'}`;
  if (row.mock === true || source === 'mock') {
    message = 'GitHub heartbeat unavailable; mock envelope active';
    state = state === 'healthy' ? 'degraded' : state;
  }

  return {
    key: 'runtime',
    ok: true,
    state,
    statusCode: leaf.status,
    message,
    lastUpdated,
    fallbackMode: state === 'stale' || state === 'degraded' ? 'cached' : 'live',
  };
}

function normalizeIntegrityLane(leaf: SnapshotLeaf): SnapshotLaneState {
  const lastUpdated = extractLaneLastUpdated('integrity', leaf.data);
  if (!leaf.ok) {
    const { state, message } = classifyHttpFailure(leaf.status, leaf.error);
    return {
      key: 'integrity',
      ok: false,
      state,
      statusCode: leaf.status,
      message,
      lastUpdated,
      fallbackMode: 'offline',
    };
  }
  const row = asRecord(leaf.data);
  if (row?.ok !== true) {
    return {
      key: 'integrity',
      ok: false,
      state: 'degraded',
      statusCode: leaf.status,
      message: 'Integrity payload missing ok',
      lastUpdated,
      fallbackMode: 'offline',
    };
  }
  const degraded = Boolean(row.degraded);
  const source = typeof row.source === 'string' ? row.source : '';
  let state: SnapshotLaneSemanticState = degraded || source === 'mock' ? 'degraded' : 'healthy';
  if (source === 'cached') state = 'stale';
  const message =
    degraded || source === 'mock'
      ? `GI live with degradation (source: ${source || 'unknown'})`
      : source === 'cached'
        ? 'GI from Redis cache (stale risk)'
        : `Integrity nominal (source: ${source || 'live'})`;

  return {
    key: 'integrity',
    ok: true,
    state,
    statusCode: leaf.status,
    message,
    lastUpdated,
    fallbackMode: source === 'cached' ? 'cached' : 'live',
  };
}

function normalizeSignalsLane(leaf: SnapshotLeaf): SnapshotLaneState {
  const lastUpdated = extractLaneLastUpdated('signals', leaf.data);
  if (!leaf.ok) {
    const { state, message } = classifyHttpFailure(leaf.status, leaf.error);
    return {
      key: 'signals',
      ok: false,
      state,
      statusCode: leaf.status,
      message,
      lastUpdated,
      fallbackMode: 'offline',
    };
  }
  const row = asRecord(leaf.data);
  if (row?.ok !== true) {
    return {
      key: 'signals',
      ok: false,
      state: 'degraded',
      statusCode: leaf.status,
      message: typeof row?.error === 'string' ? row.error : 'Micro-signals not ok',
      lastUpdated,
      fallbackMode: 'offline',
    };
  }
  const age = ageMs(lastUpdated);
  let state: SnapshotLaneSemanticState = 'healthy';
  if (age !== null && age > STALE_MS_SIGNALS) state = 'stale';
  const healthy = row.healthy === true;
  if (!healthy) state = state === 'healthy' ? 'degraded' : state;

  return {
    key: 'signals',
    ok: true,
    state,
    statusCode: leaf.status,
    message: healthy ? 'Micro-agent sweep healthy' : 'Micro-agent sweep reported unhealthy',
    lastUpdated,
    fallbackMode: state === 'stale' ? 'cached' : 'live',
  };
}

function normalizeKvLane(leaf: SnapshotLeaf): SnapshotLaneState {
  const lastUpdated = extractLaneLastUpdated('kvHealth', leaf.data);
  if (!leaf.ok) {
    const { state, message } = classifyHttpFailure(leaf.status, leaf.error);
    return {
      key: 'kvHealth',
      ok: false,
      state,
      statusCode: leaf.status,
      message,
      lastUpdated,
      fallbackMode: 'offline',
    };
  }
  const row = asRecord(leaf.data);
  const available = row?.ok === true;
  return {
    key: 'kvHealth',
    ok: true,
    state: available ? 'healthy' : 'degraded',
    statusCode: leaf.status,
    message: available ? 'KV reachable' : 'KV unavailable or misconfigured',
    lastUpdated,
    fallbackMode: available ? 'live' : 'offline',
  };
}

function normalizeAgentsLane(leaf: SnapshotLeaf): SnapshotLaneState {
  const lastUpdated = extractLaneLastUpdated('agents', leaf.data);
  if (!leaf.ok) {
    const { state, message } = classifyHttpFailure(leaf.status, leaf.error);
    return {
      key: 'agents',
      ok: false,
      state,
      statusCode: leaf.status,
      message,
      lastUpdated,
      fallbackMode: 'offline',
    };
  }
  const row = asRecord(leaf.data);
  if (row?.ok !== true) {
    return {
      key: 'agents',
      ok: false,
      state: 'degraded',
      statusCode: leaf.status,
      message: 'Agent status not ok',
      lastUpdated,
      fallbackMode: 'offline',
    };
  }
  const agents = row.agents;
  const n = Array.isArray(agents) ? agents.length : 0;
  return {
    key: 'agents',
    ok: true,
    state: n === 0 ? 'empty' : 'healthy',
    statusCode: leaf.status,
    message: n === 0 ? 'Roster empty' : `${n} agent(s) in roster`,
    lastUpdated,
    fallbackMode: n === 0 ? 'empty' : 'live',
  };
}

function normalizeEchoLane(leaf: SnapshotLeaf): SnapshotLaneState {
  const lastUpdated = extractLaneLastUpdated('echo', leaf.data);
  if (!leaf.ok) {
    const { state, message } = classifyHttpFailure(leaf.status, leaf.error);
    return {
      key: 'echo',
      ok: false,
      state,
      statusCode: leaf.status,
      message,
      lastUpdated,
      fallbackMode: 'offline',
    };
  }
  const row = asRecord(leaf.data);
  if (!row) {
    return {
      key: 'echo',
      ok: false,
      state: 'offline',
      statusCode: leaf.status,
      message: 'ECHO payload missing',
      lastUpdated,
      fallbackMode: 'offline',
    };
  }
  const status = asRecord(row.status);
  const lastIngest = status && typeof status.lastIngest === 'string' ? status.lastIngest : null;
  const ingestAge = ageMs(lastIngest);
  let state: SnapshotLaneSemanticState = 'healthy';
  if (ingestAge !== null && ingestAge > STALE_MS_ECHO_INGEST) state = 'stale';

  const epicon = row.epicon;
  const n = Array.isArray(epicon) ? epicon.length : 0;
  const integrity = asRecord(row.integrity);
  const micProv =
    integrity && typeof integrity.totalMicProvisional === 'number'
      ? integrity.totalMicProvisional
      : integrity && typeof integrity.totalMicMinted === 'number'
        ? integrity.totalMicMinted
        : null;
  const micNote = micProv !== null ? ` · MIC provisional ${micProv.toFixed(4)}` : '';
  let message = `ECHO feed · ${n} epicon item(s)${micNote}`;
  if (state === 'stale') message = `Ingest stale; ${message.toLowerCase()}`;

  return {
    key: 'echo',
    ok: true,
    state,
    statusCode: leaf.status,
    message,
    lastUpdated: lastIngest ?? lastUpdated,
    fallbackMode: state === 'stale' ? 'cached' : 'live',
  };
}

function normalizePromotionLane(leaf: SnapshotLeaf): SnapshotLaneState {
  const lastUpdated = extractLaneLastUpdated('promotion', leaf.data);
  if (!leaf.ok) {
    const { state, message } = classifyHttpFailure(leaf.status, leaf.error);
    return {
      key: 'promotion',
      ok: false,
      state,
      statusCode: leaf.status,
      message,
      lastUpdated,
      fallbackMode: 'offline',
    };
  }
  const row = asRecord(leaf.data);
  if (row?.ok !== true) {
    return {
      key: 'promotion',
      ok: false,
      state: 'degraded',
      statusCode: leaf.status,
      message: 'Promotion status not ok',
      lastUpdated,
      fallbackMode: 'offline',
    };
  }
  const counters = asRecord(row.counters);
  const pending = typeof counters?.pending_promotable_count === 'number' ? counters.pending_promotable_count : 0;
  return {
    key: 'promotion',
    ok: true,
    state: 'healthy',
    statusCode: leaf.status,
    message: `Promotion lane · ${pending} pending promotable`,
    lastUpdated,
    fallbackMode: 'live',
  };
}

function normalizeEveLane(leaf: SnapshotLeaf): SnapshotLaneState {
  const lastUpdated = extractLaneLastUpdated('eve', leaf.data);
  if (!leaf.ok) {
    const { state, message } = classifyHttpFailure(leaf.status, leaf.error);
    return {
      key: 'eve',
      ok: false,
      state,
      statusCode: leaf.status,
      message,
      lastUpdated,
      fallbackMode: 'offline',
    };
  }
  const row = asRecord(leaf.data);
  if (!row) {
    return {
      key: 'eve',
      ok: false,
      state: 'offline',
      statusCode: leaf.status,
      message: 'EVE payload missing',
      lastUpdated,
      fallbackMode: 'offline',
    };
  }
  const inSync = row.inSync === true;
  const status = typeof row.status === 'string' ? row.status : '';
  let state: SnapshotLaneSemanticState = 'healthy';
  if (!inSync || status === 'drift_detected') state = 'degraded';

  return {
    key: 'eve',
    ok: true,
    state,
    statusCode: leaf.status,
    message: inSync ? 'Cycle engine in sync with transform' : 'Cycle drift: epoch vs transform mismatch',
    lastUpdated,
    fallbackMode: 'live',
  };
}

function normalizeMicReadinessLane(leaf: SnapshotLeaf): SnapshotLaneState {
  const lastUpdated = extractLaneLastUpdated('micReadiness', leaf.data);
  if (!leaf.ok) {
    const { state, message } = classifyHttpFailure(leaf.status, leaf.error);
    return {
      key: 'micReadiness',
      ok: false,
      state,
      statusCode: leaf.status,
      message,
      lastUpdated,
      fallbackMode: 'offline',
    };
  }
  const row = asRecord(leaf.data);
  const gi = typeof row?.gi === 'number' && Number.isFinite(row.gi) ? row.gi : null;
  const mint = typeof row?.mintReadiness === 'string' ? row.mintReadiness : '—';
  const reserve =
    row?.reserve && typeof row.reserve === 'object'
      ? (row.reserve as Record<string, unknown>).inProgressBalance
      : null;
  const r =
    typeof reserve === 'number' && Number.isFinite(reserve) ? (reserve as number).toFixed(2) : '—';
  const msg =
    gi !== null
      ? `MIC readiness: GI ${gi.toFixed(2)} · reserve ${r} · mint ${mint}`
      : `MIC readiness: reserve ${r} · mint ${mint}`;
  return {
    key: 'micReadiness',
    ok: true,
    state: 'healthy',
    statusCode: leaf.status,
    message: msg,
    lastUpdated,
    fallbackMode: 'live',
  };
}

function normalizeTripwireLane(leaf: SnapshotLeaf): SnapshotLaneState {
  const lastUpdated = extractLaneLastUpdated('tripwire', leaf.data);
  if (!leaf.ok) {
    const { state, message } = classifyHttpFailure(leaf.status, leaf.error);
    return { key: 'tripwire', ok: false, state, statusCode: leaf.status, message, lastUpdated, fallbackMode: 'offline' };
  }
  const row = asRecord(leaf.data);
  const tw = row?.tripwire && typeof row.tripwire === 'object' ? (row.tripwire as Record<string, unknown>) : null;
  const active = tw?.active === true;
  const level = typeof tw?.level === 'string' ? tw.level : '';
  const reason = typeof tw?.reason === 'string' ? tw.reason : '';
  const elevated = active || level === 'elevated' || level === 'triggered' || level === 'high' || level === 'medium';
  const state: SnapshotLaneSemanticState = elevated ? 'degraded' : 'healthy';
  const message = elevated ? `Tripwire active (${level || 'active'})${reason ? `: ${reason}` : ''}` : 'No active tripwires';
  return {
    key: 'tripwire',
    ok: true,
    state,
    statusCode: leaf.status,
    message,
    lastUpdated,
    fallbackMode: 'live',
  };
}

function normalizeVaultLane(leaf: SnapshotLeaf): SnapshotLaneState {
  const lastUpdated = extractLaneLastUpdated('vault', leaf.data);
  if (!leaf.ok) {
    const { state, message } = classifyHttpFailure(leaf.status, leaf.error);
    return { key: 'vault', ok: false, state, statusCode: leaf.status, message, lastUpdated, fallbackMode: 'offline' };
  }
  const row = asRecord(leaf.data);
  if (row?.ok !== true) {
    return {
      key: 'vault',
      ok: false,
      state: 'degraded',
      statusCode: leaf.status,
      message: 'Vault status not ok',
      lastUpdated,
      fallbackMode: 'offline',
    };
  }
  const balance = typeof row.balance_reserve === 'number' ? row.balance_reserve : 0;
  const sealedTotal =
    typeof (row as Record<string, unknown>).sealed_reserve_total === 'number'
      ? ((row as Record<string, unknown>).sealed_reserve_total as number)
      : 0;
  const inProg =
    typeof (row as Record<string, unknown>).in_progress_balance === 'number'
      ? ((row as Record<string, unknown>).in_progress_balance as number)
      : null;
  const status = typeof row.status === 'string' ? row.status : 'sealed';
  const preview = row.preview_active === true;
  const fountain = (row as Record<string, unknown>).fountain_status;
  const b = balance.toFixed(2);
  const tranche =
    inProg !== null
      ? ` · sealed ${sealedTotal.toFixed(0)} · tranche ${inProg.toFixed(2)}/50`
      : '';
  const fountainBit =
    typeof fountain === 'string' ? ` · fountain ${fountain}` : '';
  const message = `Vault · ${b} reserve (v1)${tranche}${fountainBit} · ${status}${preview ? ' · preview' : ''}`;
  return {
    key: 'vault',
    ok: true,
    state: 'healthy',
    statusCode: leaf.status,
    message,
    lastUpdated,
    fallbackMode: 'live',
  };
}

function normalizeMiiLane(leaf: SnapshotLeaf): SnapshotLaneState {
  const lastUpdated = extractLaneLastUpdated('mii', leaf.data);
  if (!leaf.ok) {
    const { state, message } = classifyHttpFailure(leaf.status, leaf.error);
    return { key: 'mii', ok: false, state, statusCode: leaf.status, message, lastUpdated, fallbackMode: 'offline' };
  }
  const row = asRecord(leaf.data);
  if (row?.ok !== true) {
    return {
      key: 'mii',
      ok: false,
      state: 'degraded',
      statusCode: leaf.status,
      message: 'MII feed not ok',
      lastUpdated,
      fallbackMode: 'offline',
    };
  }
  const count = typeof row.count === 'number' ? row.count : 0;
  const agentCount = Array.isArray(row.agents) ? row.agents.length : 0;
  return {
    key: 'mii',
    ok: true,
    state: count === 0 ? 'empty' : 'healthy',
    statusCode: leaf.status,
    message: count === 0 ? 'MII feed empty' : `MII feed · ${count} entries · ${agentCount} agent(s)`,
    lastUpdated,
    fallbackMode: count === 0 ? 'empty' : 'live',
  };
}

export function normalizeSnapshotLane(key: SnapshotLaneKey, leaf: SnapshotLeaf): SnapshotLaneState {
  switch (key) {
    case 'integrity':
      return normalizeIntegrityLane(leaf);
    case 'signals':
      return normalizeSignalsLane(leaf);
    case 'kvHealth':
      return normalizeKvLane(leaf);
    case 'agents':
      return normalizeAgentsLane(leaf);
    case 'epicon':
      return normalizeEpiconLane(leaf);
    case 'echo':
      return normalizeEchoLane(leaf);
    case 'journal':
      return normalizeJournalLane(leaf);
    case 'sentiment':
      return normalizeSentimentLane(leaf);
    case 'runtime':
      return normalizeRuntimeLane(leaf);
    case 'promotion':
      return normalizePromotionLane(leaf);
    case 'eve':
      return normalizeEveLane(leaf);
    case 'mii':
      return normalizeMiiLane(leaf);
    case 'vault':
      return normalizeVaultLane(leaf);
    case 'micReadiness':
      return normalizeMicReadinessLane(leaf);
    case 'tripwire':
      return normalizeTripwireLane(leaf);
    default:
      return {
        key,
        ok: leaf.ok,
        state: leaf.ok ? 'healthy' : 'offline',
        statusCode: leaf.status,
        message: leaf.error ?? (leaf.ok ? 'ok' : 'failed'),
        lastUpdated: null,
        fallbackMode: leaf.ok ? 'live' : 'offline',
      };
  }
}

export function normalizeAllSnapshotLanes(leaves: Record<SnapshotLaneKey, SnapshotLeaf>): SnapshotLaneState[] {
  return SNAPSHOT_LANE_KEYS.map((key) => normalizeSnapshotLane(key, leaves[key]));
}

/** Short label for compact UI */
export function laneStateAbbrev(state: SnapshotLaneSemanticState): string {
  switch (state) {
    case 'healthy':
      return 'ok';
    case 'degraded':
      return 'deg';
    case 'offline':
      return 'off';
    case 'stale':
      return 'stale';
    case 'empty':
      return 'empty';
    default:
      return '?';
  }
}
