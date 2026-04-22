import type { SubstrateJournalEntry } from '@/lib/substrate/github-journal';
import { checkProvenanceBreak, checkTemporalCoherence } from '@/lib/tripwire/archiveChecks';
import { checkJournalQualityDrift } from '@/lib/tripwire/journalQuality';
import type { TripwireSeverity, TrustTripwireResult, TrustTripwireSnapshot } from '@/lib/tripwire/types';

type EvaluateArgs = {
  journals: SubstrateJournalEntry[];
  epiconRows: Array<Record<string, unknown>>;
};

type AgentLikeEntry = { agent?: string; source?: string };

function checkVerificationDilution(epiconRows: Array<Record<string, unknown>>) {
  const total = epiconRows.length;
  if (total === 0) {
    return {
      triggered: false,
      severity: 'nominal' as TripwireSeverity,
      lowConfidenceRate: 0,
      total,
    };
  }

  const lowConfidence = epiconRows.filter((row) => {
    const confidence = typeof row.confidence === 'number' ? row.confidence : 1;
    const status = typeof row.status === 'string' ? row.status.toLowerCase() : '';
    return confidence < 0.7 || status === 'unverified' || status === 'contested' || status === 'soft-confirmed';
  }).length;

  const lowConfidenceRate = lowConfidence / total;

  return {
    triggered: lowConfidenceRate > 0.25,
    severity: lowConfidenceRate > 0.4 ? 'critical' as TripwireSeverity : lowConfidenceRate > 0.25 ? 'elevated' as TripwireSeverity : 'nominal' as TripwireSeverity,
    lowConfidenceRate,
    total,
  };
}

function checkTrustConcentration(entries: AgentLikeEntry[]) {
  const total = entries.length;
  if (total === 0) {
    return {
      triggered: false,
      severity: 'nominal' as TripwireSeverity,
      dominantShare: 0,
      dominantKey: null,
      counts: {} as Record<string, number>,
    };
  }

  const counts = new Map<string, number>();
  for (const row of entries) {
    const key = row.agent ?? row.source ?? 'unknown';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  let dominantKey: string | null = null;
  let dominantCount = 0;
  for (const [key, count] of counts.entries()) {
    if (count > dominantCount) {
      dominantCount = count;
      dominantKey = key;
    }
  }

  const dominantShare = dominantCount / total;

  return {
    triggered: dominantShare > 0.7,
    severity: dominantShare > 0.85 ? 'critical' as TripwireSeverity : dominantShare > 0.7 ? 'elevated' as TripwireSeverity : 'nominal' as TripwireSeverity,
    dominantShare,
    dominantKey,
    counts: Object.fromEntries(counts),
  };
}

export function evaluateTrustTripwires({ journals, epiconRows }: EvaluateArgs): TrustTripwireSnapshot {
  const timestamp = new Date().toISOString();
  const provenance = checkProvenanceBreak(journals);
  const temporal = checkTemporalCoherence(journals);
  const journalDrift = checkJournalQualityDrift(journals);
  const dilution = checkVerificationDilution(epiconRows);
  const concentration = checkTrustConcentration(
    epiconRows.map((row) => ({
      agent: typeof row.agentOrigin === 'string' ? row.agentOrigin : undefined,
      source: typeof row.source === 'string' ? row.source : undefined,
    })),
  );

  const results: TrustTripwireResult[] = [
    {
      kind: 'provenance_break',
      ok: !provenance.triggered,
      triggered: provenance.triggered,
      severity: provenance.severity,
      score: provenance.triggered ? 0.4 : 1,
      message: provenance.triggered ? 'PROVENANCE BREAK — trust chain incomplete' : 'Provenance chain intact',
      affectedAgents: provenance.affectedAgents,
      evidence: provenance,
      timestamp,
    },
    {
      kind: 'temporal_coherence',
      ok: !temporal.triggered,
      triggered: temporal.triggered,
      severity: temporal.severity,
      score: temporal.triggered ? 0.2 : 1,
      message: temporal.triggered ? 'TEMPORAL BREAK — replay integrity compromised' : 'Timeline coherence nominal',
      affectedAgents: temporal.affectedAgents,
      evidence: temporal,
      timestamp,
    },
    {
      kind: 'journal_quality_drift',
      ok: !journalDrift.triggered,
      triggered: journalDrift.triggered,
      severity: journalDrift.severity,
      score: journalDrift.triggered ? 0.5 : 1,
      message: journalDrift.triggered ? 'JOURNAL DRIFT — agent cognition degrading' : 'Journal quality nominal',
      affectedAgents: journalDrift.affectedAgents,
      evidence: journalDrift,
      timestamp,
    },
    {
      kind: 'verification_dilution',
      ok: !dilution.triggered,
      triggered: dilution.triggered,
      severity: dilution.severity,
      score: dilution.triggered ? 0.45 : 1,
      message: dilution.triggered ? 'VERIFICATION DILUTION — archive rigor weakening' : 'Verification density nominal',
      evidence: dilution,
      timestamp,
    },
    {
      kind: 'trust_concentration',
      ok: !concentration.triggered,
      triggered: concentration.triggered,
      severity: concentration.severity,
      score: concentration.triggered ? 0.55 : 1,
      message: concentration.triggered ? 'TRUST CONCENTRATION — monoculture detected' : 'Trust distribution healthy',
      evidence: concentration,
      timestamp,
    },
  ];

  const tripwireCount = results.filter((result) => result.triggered).length;
  const critical = results.some((result) => result.triggered && result.severity === 'critical');

  return {
    ok: tripwireCount === 0,
    tripwireCount,
    elevated: tripwireCount > 0,
    critical,
    results,
    timestamp,
  };
}

export function trustMultiplier(snapshot: TrustTripwireSnapshot | null | undefined): number {
  if (!snapshot) return 1;
  const penalties = snapshot.results
    .filter((result) => result.triggered)
    .reduce((sum, result) => {
      if (result.severity === 'critical') return sum + 0.12;
      if (result.severity === 'elevated') return sum + 0.05;
      return sum;
    }, 0);

  return Math.max(0.5, 1 - penalties);
}

export function applyTrustTripwiresToAgentStatus(
  agent: string,
  snapshot: TrustTripwireSnapshot | null | undefined,
): 'ACTIVE' | 'DEGRADED' | 'CONTESTED' {
  if (!snapshot) return 'ACTIVE';

  const hits = snapshot.results.filter(
    (result) => result.triggered && (result.affectedAgents ?? []).includes(agent),
  );

  if (hits.some((result) => result.severity === 'critical')) return 'CONTESTED';
  if (hits.length > 0) return 'DEGRADED';
  return 'ACTIVE';
}
