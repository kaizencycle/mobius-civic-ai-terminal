import type { Agent, EpiconItem, GISnapshot, Tripwire } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function transformAgent(raw: any): Agent {
  return {
    id: raw.id,
    name: raw.name,
    role: raw.role,
    color: raw.color,
    status: raw.status,
    heartbeatOk: raw.heartbeat_ok ?? raw.heartbeatOk,
    lastAction: raw.last_action ?? raw.lastAction,
  };
}

const EPICON_CATEGORIES = new Set(['geopolitical', 'market', 'governance', 'infrastructure', 'narrative']);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function transformEpicon(raw: any): EpiconItem {
  const catRaw = raw.category ?? raw.dominantTheme;
  const category = EPICON_CATEGORIES.has(catRaw) ? catRaw : 'geopolitical';

  const body = typeof raw.body === 'string' ? raw.body : undefined;
  const summary =
    typeof raw.summary === 'string' && raw.summary.trim()
      ? raw.summary
      : body && body.trim()
        ? body.slice(0, 280)
        : '';

  const verified = Boolean(raw.verified);
  const status: EpiconItem['status'] = verified ? 'verified' : 'pending';

  const author = typeof raw.author === 'string' ? raw.author : 'operator';
  const tierRaw = raw.confidence_tier ?? raw.confidenceTier;
  const confidenceTier =
    typeof tierRaw === 'number' && tierRaw >= 0 && tierRaw <= 4
      ? (tierRaw as EpiconItem['confidenceTier'])
      : 2;

  const trace =
    Array.isArray(raw.trace) && raw.trace.every((t: unknown): t is string => typeof t === 'string')
      ? raw.trace
      : [];

  return {
    id: raw.id,
    title: raw.title,
    category,
    status,
    confidenceTier,
    ownerAgent: raw.owner_agent ?? raw.ownerAgent ?? author,
    sources: Array.isArray(raw.sources) ? raw.sources : [],
    timestamp: raw.timestamp,
    summary,
    trace,
    feedSource: typeof raw.source === 'string' ? raw.source : undefined,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function transformGI(raw: any): GISnapshot {
  return {
    score: raw.score,
    delta: raw.delta,
    mode: raw.mode,
    terminalStatus: raw.terminal_status ?? raw.terminalStatus,
    primaryDriver: raw.primary_driver ?? raw.primaryDriver,
    summary: raw.summary,
    institutionalTrust: raw.institutional_trust ?? raw.institutionalTrust,
    infoReliability: raw.info_reliability ?? raw.infoReliability,
    consensusStability: raw.consensus_stability ?? raw.consensusStability,
    signalBreakdown: raw.signal_breakdown ?? raw.signalBreakdown,
    weekly: raw.weekly,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function transformTripwire(raw: any): Tripwire {
  return {
    id: raw.id,
    label: raw.label,
    severity: raw.severity,
    owner: raw.owner,
    openedAt: raw.opened_at ?? raw.openedAt,
    action: raw.action,
  };
}
