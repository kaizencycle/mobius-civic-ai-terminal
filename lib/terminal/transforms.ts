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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function transformEpicon(raw: any): EpiconItem {
  return {
    id: raw.id,
    title: raw.title,
    category: raw.category,
    status: raw.status,
    confidenceTier: raw.confidence_tier ?? raw.confidenceTier,
    ownerAgent: raw.owner_agent ?? raw.ownerAgent,
    sources: raw.sources,
    timestamp: raw.timestamp,
    summary: raw.summary,
    trace: raw.trace,
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
