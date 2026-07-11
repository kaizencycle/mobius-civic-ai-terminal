import { loadGIState, loadSignalSnapshot, kvGet } from '@/lib/kv/store';
import { loadSustainState, SUSTAIN_REQUIRED_CYCLES } from '@/lib/mic/sustainTracker';
import type {
  ConfidenceLabel,
  FountainStateManifest,
  FountainStateName,
  GIPerceptionManifest,
  IntegrityPerceptionResponse,
  SourceDiversity,
} from '@/lib/mfs/types';

const KV_GI_MANIFEST = 'mfs:gi-perception-manifest';
const KV_FOUNTAIN_STATE = 'mfs:fountain-state';
const GI_FOUNTAIN_THRESHOLD = 0.95;
const WEIGHT_VERSION =
  process.env.GI_WEIGHT_VERSION?.trim() || 'runtime-assembled-v0';

type SignalRow = {
  agentName: string;
  source: string;
  value: number;
  label: string;
  severity: string;
  timestamp?: string;
};

function agentFamily(agentName: string): string {
  return agentName.split('-')[0]?.toUpperCase() ?? 'UNKNOWN';
}

function confidenceLabel(score: number): ConfidenceLabel {
  if (score >= 0.75) return 'high';
  if (score >= 0.5) return 'moderate';
  return 'low';
}

function sourceDiversity(instrumentCount: number, familyCount: number): SourceDiversity {
  if (instrumentCount === 0) return 'low';
  const ratio = familyCount / Math.max(1, instrumentCount);
  if (instrumentCount >= 20 && ratio >= 0.25) return 'high';
  if (instrumentCount >= 8 && ratio >= 0.15) return 'moderate';
  return 'low';
}

function inferFountainState(input: {
  gi: number;
  giConfidence: number;
  sustainObserved: number;
  sustainRequired: number;
  criticalSignals: number;
  giDegraded: boolean;
  vaultFountainLane?: string | null;
}): FountainStateName {
  if (input.giDegraded || input.criticalSignals >= 3) {
    return 'QUARANTINED';
  }
  if (input.criticalSignals >= 1 && input.gi >= GI_FOUNTAIN_THRESHOLD) {
    return 'AUDIT_REQUIRED';
  }
  if (input.gi < 0.8) return 'DORMANT';
  if (input.gi < 0.88) return 'OBSERVING';
  if (input.gi < GI_FOUNTAIN_THRESHOLD) return 'APPROACHING';
  if (input.sustainObserved < input.sustainRequired) return 'PROVISIONAL_GI95';
  if (input.vaultFountainLane === 'active' || input.vaultFountainLane === 'unsealed') {
    return 'REVIEW_WINDOW_OPEN';
  }
  if (input.sustainObserved >= input.sustainRequired) return 'SUSTAINED_GI95';
  return 'PROVISIONAL_GI95';
}

function publicMessageForState(state: FountainStateName): string {
  switch (state) {
    case 'REVIEW_WINDOW_OPEN':
      return (
        "The network's current attested integrity estimate has survived sustained verification. " +
        'Integrity Grade requests may be submitted during the review window — recognition is not guaranteed.'
      );
    case 'QUARANTINED':
      return 'Fountain eligibility is quarantined pending resolution of contradictions or source failures.';
    case 'AUDIT_REQUIRED':
      return 'Weight freeze and adversarial review are in progress before Fountain eligibility advances.';
    case 'PROVISIONAL_GI95':
    case 'SUSTAINED_GI95':
      return (
        "The network's current attested integrity estimate is improving. Fountain eligibility requires " +
        'sustained verification and independent audit.'
      );
    default:
      return (
        "GI reflects the federation's attested perception — not a target to optimize. " +
        'Fountain eligibility requires sustained verification and independent audit.'
      );
  }
}

async function assembleGiPerception(
  observedAt: string,
  signals: SignalRow[],
  giValue: number,
  giTimestamp: string | null,
  giDegraded: boolean,
): Promise<GIPerceptionManifest> {
  const instrumentCount = signals.length;
  const critical = signals.filter((s) => s.severity === 'critical').length;
  const elevated = signals.filter((s) => s.severity === 'elevated').length;
  const watch = signals.filter((s) => s.severity === 'watch').length;
  const healthy = signals.filter((s) => s.severity === 'nominal' || s.severity === 'info').length;
  const degradedInstruments = elevated + watch;
  const unavailable = giDegraded ? Math.max(1, Math.floor(instrumentCount * 0.1)) : 0;

  const families = new Set(signals.map((s) => agentFamily(s.agentName)));
  const measuredDomains = [...families].map((f) => f.toLowerCase());

  const blindSpots: string[] = [];
  if (instrumentCount === 0) {
    blindSpots.push('No live signal instruments available in snapshot');
  }
  if (giDegraded) {
    blindSpots.push('GI state marked degraded — confidence reduced');
  }
  for (const signal of signals.filter((s) => s.severity === 'critical' || s.severity === 'elevated').slice(0, 5)) {
    blindSpots.push(`${signal.label || signal.agentName} (${signal.severity})`);
  }

  const ageMs = giTimestamp ? Date.now() - new Date(giTimestamp).getTime() : Number.POSITIVE_INFINITY;
  const freshness = Number.isFinite(ageMs) && ageMs < 15 * 60 * 1000 ? 1 : ageMs < 60 * 60 * 1000 ? 0.6 : 0.3;
  const coverage =
    instrumentCount > 0 ? healthy / instrumentCount : giDegraded ? 0.35 : 0.5;
  const confidence = Number(Math.min(0.95, Math.max(0.2, coverage * 0.55 + freshness * 0.45 - critical * 0.05)).toFixed(2));

  return {
    schema_version: '0.1',
    gi: {
      value: Number(giValue.toFixed(4)),
      confidence,
      confidence_label: confidenceLabel(confidence),
      measured_domains: measuredDomains,
      instrument_count: instrumentCount,
      healthy_instruments: healthy,
      degraded_instruments: degradedInstruments,
      unavailable_instruments: unavailable,
      source_diversity: sourceDiversity(instrumentCount, families.size),
      known_blind_spots: blindSpots,
      weight_version: WEIGHT_VERSION,
      observed_at: giTimestamp ?? observedAt,
    },
    observed_at: observedAt,
  };
}

async function assembleFountainState(
  observedAt: string,
  giValue: number,
  giConfidence: number,
  sustainObserved: number,
  sustainRequired: number,
  criticalSignals: number,
  giDegraded: boolean,
  vaultFountainLane?: string | null,
): Promise<FountainStateManifest> {
  const state = inferFountainState({
    gi: giValue,
    giConfidence,
    sustainObserved,
    sustainRequired,
    criticalSignals,
    giDegraded,
    vaultFountainLane,
  });

  const auditPending = state === 'AUDIT_REQUIRED' || state === 'PROVISIONAL_GI95';

  return {
    schema_version: '0.1',
    state,
    gi_value: Number(giValue.toFixed(4)),
    gi_confidence: giConfidence,
    sustained_cycles_required: sustainRequired,
    sustained_cycles_observed: sustainObserved,
    provisional_since: giValue >= GI_FOUNTAIN_THRESHOLD ? observedAt : null,
    review_window:
      state === 'REVIEW_WINDOW_OPEN'
        ? { opened_at: observedAt, closes_at: null }
        : { opened_at: null, closes_at: null },
    audit: {
      status: auditPending ? 'in_progress' : state === 'SUSTAINED_GI95' ? 'passed' : 'not_required',
      weight_frozen: auditPending || state === 'SUSTAINED_GI95',
      adversarial_replay: auditPending ? 'in_progress' : 'not_started',
      holdout_review: auditPending ? 'not_started' : 'not_started',
    },
    quarantine: {
      active: state === 'QUARANTINED',
      reasons: state === 'QUARANTINED' ? ['GI degraded or elevated critical signal density'] : [],
      since: state === 'QUARANTINED' ? observedAt : null,
    },
    weight_version: WEIGHT_VERSION,
    observed_at: observedAt,
    public_message: publicMessageForState(state),
  };
}

export async function loadIntegrityPerception(
  vaultFountainLane?: string | null,
): Promise<IntegrityPerceptionResponse> {
  const observedAt = new Date().toISOString();

  const [kvGi, kvFountain, giState, snapshot, sustain] = await Promise.all([
    kvGet<GIPerceptionManifest>(KV_GI_MANIFEST),
    kvGet<FountainStateManifest>(KV_FOUNTAIN_STATE),
    loadGIState().catch(() => null),
    loadSignalSnapshot().catch(() => null),
    loadSustainState().catch(() => null),
  ]);

  if (kvGi && kvFountain) {
    return {
      ok: true,
      schema_version: '0.1',
      assembled: false,
      degraded: false,
      gi_perception: kvGi,
      fountain_state: kvFountain,
      sources: {
        gi: 'kv:mfs:gi-perception-manifest',
        fountain: 'kv:mfs:fountain-state',
        signals: 'kv',
      },
      canon: [
        'GI witnesses integrity — it is not objective truth.',
        'Fountain eligibility is provisional until sustained verification and audit.',
        'This endpoint is read-only; it does not mutate GI mathematics.',
      ],
      at: observedAt,
    };
  }

  const signals = (snapshot?.allSignals ?? []) as SignalRow[];
  const giValue =
    typeof giState?.global_integrity === 'number' ? giState.global_integrity : snapshot?.composite ?? 0;
  const giDegraded = Boolean(snapshot && snapshot.healthy === false);
  const criticalSignals = signals.filter((s) => s.severity === 'critical').length;
  const sustainObserved = sustain?.consecutiveEligibleCycles ?? 0;
  const sustainRequired = SUSTAIN_REQUIRED_CYCLES;

  const giPerception = await assembleGiPerception(
    observedAt,
    signals,
    giValue,
    giState?.timestamp ?? snapshot?.timestamp ?? null,
    giDegraded,
  );

  const fountainState = await assembleFountainState(
    observedAt,
    giValue,
    giPerception.gi.confidence,
    sustainObserved,
    sustainRequired,
    criticalSignals,
    giDegraded,
    vaultFountainLane,
  );

  return {
    ok: true,
    schema_version: '0.1',
    assembled: true,
    degraded: giDegraded || signals.length === 0,
    gi_perception: giPerception,
    fountain_state: fountainState,
    sources: {
      gi: giState ? 'kv:gi-state' : 'signal-snapshot-fallback',
      fountain: 'assembled-from-sustain-and-gi',
      signals: snapshot ? 'kv:signal-snapshot' : 'unavailable',
    },
    canon: [
      'GI witnesses integrity — it is not objective truth.',
      'Fountain eligibility is provisional until sustained verification and audit.',
      'Assembled display layer — does not change GI computation.',
      'Canonical federation manifests may be published to KV when available.',
    ],
    at: observedAt,
  };
}
