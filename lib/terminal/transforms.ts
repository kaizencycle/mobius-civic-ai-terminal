import type { Agent, EpiconItem, GISnapshot, Tripwire } from './types';
import { asRecord, bool, firstDefined, num, numOpt, oneOf, str, strArray, strOpt } from './raw';

export function transformAgent(raw: unknown): Agent {
  const r = asRecord(raw);
  return {
    id: str(r.id),
    name: str(r.name),
    role: str(r.role),
    color: str(r.color),
    status: str(r.status) as Agent['status'],
    heartbeatOk: bool(firstDefined(r, ['heartbeat_ok', 'heartbeatOk'])),
    lastAction: str(firstDefined(r, ['last_action', 'lastAction'])),
  };
}

const EPICON_CATEGORIES = [
  'geopolitical',
  'market',
  'governance',
  'infrastructure',
  'narrative',
  'ethics',
  'civic-risk',
] as const;

export function transformEpicon(raw: unknown): EpiconItem {
  const r = asRecord(raw);
  const category = oneOf(firstDefined(r, ['category', 'dominantTheme']), EPICON_CATEGORIES, 'geopolitical');

  const body = strOpt(r.body);
  const summaryRaw = strOpt(r.summary);
  const summary =
    summaryRaw && summaryRaw.trim()
      ? summaryRaw
      : body && body.trim()
        ? body.slice(0, 280)
        : '';

  const verified = bool(r.verified);
  const status: EpiconItem['status'] = verified ? 'verified' : 'pending';

  const author = str(r.author, 'operator');
  const tierRaw = numOpt(firstDefined(r, ['confidence_tier', 'confidenceTier']));
  const confidenceTier =
    tierRaw !== undefined && tierRaw >= 0 && tierRaw <= 4
      ? (tierRaw as EpiconItem['confidenceTier'])
      : 2;

  const trace = strArray(r.trace);

  const promotionStateRaw = r.promotion_state;
  const promotionState =
    promotionStateRaw === 'pending' ||
    promotionStateRaw === 'selected' ||
    promotionStateRaw === 'promoted' ||
    promotionStateRaw === 'failed'
      ? promotionStateRaw
      : undefined;

  return {
    id: str(r.id),
    title: str(r.title),
    category,
    status,
    confidenceTier,
    ownerAgent: str(firstDefined(r, ['owner_agent', 'ownerAgent']) ?? author),
    sources: Array.isArray(r.sources) ? (r.sources as string[]) : [],
    timestamp: str(r.timestamp),
    summary,
    trace,
    feedSource: strOpt(r.source),
    agentOrigin: strOpt(firstDefined(r, ['agentOrigin', 'agent_origin'])),
    promotionState,
    assignedAgents: Array.isArray(r.assigned_agents) ? strArray(r.assigned_agents) : undefined,
    committedEntries: Array.isArray(r.committed_entries) ? strArray(r.committed_entries) : undefined,
  };
}

export function transformGI(raw: unknown): GISnapshot {
  const r = asRecord(raw);
  return {
    score: num(r.score),
    delta: num(r.delta),
    mode: r.mode as GISnapshot['mode'],
    terminalStatus: firstDefined(r, ['terminal_status', 'terminalStatus']) as GISnapshot['terminalStatus'],
    primaryDriver: strOpt(firstDefined(r, ['primary_driver', 'primaryDriver'])),
    summary: strOpt(r.summary),
    institutionalTrust: num(firstDefined(r, ['institutional_trust', 'institutionalTrust'])),
    infoReliability: num(firstDefined(r, ['info_reliability', 'infoReliability'])),
    consensusStability: num(firstDefined(r, ['consensus_stability', 'consensusStability'])),
    signalBreakdown: firstDefined(r, ['signal_breakdown', 'signalBreakdown']) as GISnapshot['signalBreakdown'],
    weekly: Array.isArray(r.weekly) ? (r.weekly as number[]) : [],
  };
}

export function transformTripwire(raw: unknown): Tripwire {
  const r = asRecord(raw);
  return {
    id: str(r.id),
    label: str(r.label),
    severity: str(r.severity) as Tripwire['severity'],
    owner: str(r.owner),
    openedAt: str(firstDefined(r, ['opened_at', 'openedAt'])),
    action: str(r.action),
  };
}
