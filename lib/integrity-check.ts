import { C261_COVENANT } from '@/lib/constants/covenants';

export type BreakerStage = 'nominal' | 'guarded' | 'containment' | 'halt';
export type BreakerTripwireState = 'stable' | 'watch' | 'degraded';

export type CircuitBreakerDecision = {
  stage: BreakerStage;
  status: 'OK' | 'HALT';
  message: string;
  threshold: number;
  giScore: number;
  triggeredBy: Array<'gi' | 'tripwire' | 'semantic_drift' | 'operator'>;
  writeAllowed: boolean;
  automationAllowed: boolean;
  navigationAllowed: boolean;
  requiresAcknowledgement: boolean;
};

export function evaluateCircuitBreaker({
  giScore,
  tripwireState,
  semanticDriftDetected,
  operatorHalt = false,
}: {
  giScore: number;
  tripwireState: BreakerTripwireState;
  semanticDriftDetected: boolean;
  operatorHalt?: boolean;
}): CircuitBreakerDecision {
  const triggeredBy: CircuitBreakerDecision['triggeredBy'] = [];

  if (operatorHalt) triggeredBy.push('operator');
  if (giScore < C261_COVENANT.BREAKER.CONTAINMENT_GI) triggeredBy.push('gi');
  if (tripwireState !== 'stable') triggeredBy.push('tripwire');
  if (semanticDriftDetected) triggeredBy.push('semantic_drift');

  if (
    operatorHalt ||
    giScore < C261_COVENANT.BREAKER.HARD_HALT_GI ||
    (giScore < C261_COVENANT.BREAKER.HALT_GI && (tripwireState === 'degraded' || semanticDriftDetected))
  ) {
    return {
      stage: 'halt',
      status: 'HALT',
      message: 'Hard halt engaged. Keep write lanes closed until GI and tripwire posture recover.',
      threshold: C261_COVENANT.BREAKER.HALT_GI,
      giScore,
      triggeredBy,
      writeAllowed: false,
      automationAllowed: false,
      navigationAllowed: true,
      requiresAcknowledgement: true,
    };
  }

  if (
    giScore < C261_COVENANT.BREAKER.CONTAINMENT_GI ||
    tripwireState === 'degraded' ||
    semanticDriftDetected
  ) {
    return {
      stage: 'containment',
      status: 'OK',
      message: 'Containment mode active. Investigation and read-only review remain open while write lanes are paused.',
      threshold: C261_COVENANT.BREAKER.CONTAINMENT_GI,
      giScore,
      triggeredBy,
      writeAllowed: false,
      automationAllowed: false,
      navigationAllowed: true,
      requiresAcknowledgement: false,
    };
  }

  if (
    giScore < C261_COVENANT.BREAKER.GUARDED_GI ||
    tripwireState === 'watch'
  ) {
    return {
      stage: 'guarded',
      status: 'OK',
      message: 'Guarded mode active. The terminal remains live, but operators should review integrity pressure before escalating.',
      threshold: C261_COVENANT.BREAKER.GUARDED_GI,
      giScore,
      triggeredBy,
      writeAllowed: true,
      automationAllowed: true,
      navigationAllowed: true,
      requiresAcknowledgement: false,
    };
  }

  return {
    stage: 'nominal',
    status: 'OK',
    message: 'System operating within covenant bounds.',
    threshold: C261_COVENANT.BREAKER.GUARDED_GI,
    giScore,
    triggeredBy,
    writeAllowed: true,
    automationAllowed: true,
    navigationAllowed: true,
    requiresAcknowledgement: false,
  };
}

export function checkCovenantCompliance(miiScore: number) {
  const decision = evaluateCircuitBreaker({
    giScore: miiScore,
    tripwireState: 'stable',
    semanticDriftDetected: false,
  });

  return {
    status: decision.status,
    message: decision.message,
    threshold: C261_COVENANT.GI_THRESHOLD,
  };
}
