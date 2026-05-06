import { EPICON_RUNTIME_THRESHOLDS } from './risk-thresholds';
import { normalizePrSignal } from './normalize-pr-signal';
import type {
  EpiconPrSignalInput,
  EpiconRuntimeEvaluation,
} from './types';

function clampRisk(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

export function evaluatePrRisk(
  input: EpiconPrSignalInput,
): EpiconRuntimeEvaluation {
  const normalized = normalizePrSignal(input);

  let risk = 0;
  const reasons: string[] = [];

  risk += normalized.deletions * 0.002;
  risk += normalized.sensitivePathCount * 0.25;
  risk += normalized.replaySignals * 0.15;

  if (normalized.scopeMismatch) {
    risk += 0.2;
    reasons.push('scope mismatch detected');
  }

  if (
    normalized.filesChanged >
    EPICON_RUNTIME_THRESHOLDS.largeDiffFiles
  ) {
    risk += 0.15;
    reasons.push('large diff footprint');
  }

  if (
    normalized.deletions >
    EPICON_RUNTIME_THRESHOLDS.largeDeletionCount
  ) {
    risk += 0.2;
    reasons.push('high deletion count');
  }

  if (normalized.sensitivePathCount > 0) {
    reasons.push('sensitive paths modified');
  }

  if (normalized.docsOnly) {
    risk = Math.max(0, risk - 0.25);
    reasons.push('documentation-only mutation');
  }

  risk = clampRisk(risk);

  const severity =
    risk >= EPICON_RUNTIME_THRESHOLDS.highRisk
      ? 'high'
      : risk >= EPICON_RUNTIME_THRESHOLDS.mediumRisk
        ? 'medium'
        : 'low';

  const recommendedAction =
    severity === 'high'
      ? 'clarify'
      : severity === 'medium'
        ? 'clarify'
        : 'pass';

  return {
    pass: severity !== 'high',
    risk,
    severity,
    recommendedAction,
    reasons,
    normalized,
    meta: {
      evaluator: 'epicon-runtime-layer-0',
      enforcement: 'disabled',
      deterministic: true,
    },
  };
}
