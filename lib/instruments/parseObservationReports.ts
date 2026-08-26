import type { EpiconAgentId, EpiconAgentReport, EpiconStance } from '@/lib/epicon/types';

const EPICON_AGENT_IDS: readonly EpiconAgentId[] = ['ATLAS', 'ZEUS', 'EVE', 'AUREA', 'JADE'];
const EPICON_AGENT_ID_SET = new Set<string>(EPICON_AGENT_IDS);
const EPICON_STANCES = new Set<EpiconStance>(['support', 'oppose', 'conditional']);

export type ParseObservationReportsResult =
  | { ok: true; reports: EpiconAgentReport[] }
  | { ok: false; error: 'invalid_reports' | 'invalid_agent' | 'duplicate_agent' | 'invalid_stance' };

export function parseObservationReports(raw: unknown): ParseObservationReportsResult {
  if (raw === undefined || raw === null) {
    return { ok: true, reports: [] };
  }
  if (!Array.isArray(raw)) {
    return { ok: false, error: 'invalid_reports' };
  }

  const seen = new Set<string>();
  const reports: EpiconAgentReport[] = [];

  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      return { ok: false, error: 'invalid_reports' };
    }
    const row = item as Record<string, unknown>;
    if (typeof row.agent !== 'string' || !EPICON_AGENT_ID_SET.has(row.agent)) {
      return { ok: false, error: 'invalid_agent' };
    }
    if (seen.has(row.agent)) {
      return { ok: false, error: 'duplicate_agent' };
    }
    seen.add(row.agent);

    if (typeof row.stance !== 'string' || !EPICON_STANCES.has(row.stance as EpiconStance)) {
      return { ok: false, error: 'invalid_stance' };
    }
    if (!row.ej || typeof row.ej !== 'object') {
      return { ok: false, error: 'invalid_reports' };
    }

    reports.push(item as EpiconAgentReport);
  }

  return { ok: true, reports };
}

export function isObservationAccepted(
  consensus: { status: string; quorum: { independent_ok: boolean } } | null,
): boolean {
  return consensus?.status === 'pass' && consensus.quorum.independent_ok === true;
}
