import type { MicReadinessResponse } from '@/lib/mic/types';
import type { MicSealSnapshot } from '@/lib/mic/types';

/** Build MIC_SEAL_V1 body (pre-hash) from readiness for operator proof display. */
export function buildMicSealSnapshotBody(readiness: MicReadinessResponse): Omit<MicSealSnapshot, 'hash' | 'hash_algorithm' | 'previous_hash'> {
  const gi = readiness.gi != null && Number.isFinite(readiness.gi) ? readiness.gi : 0;
  return {
    type: 'MIC_SEAL_V1',
    cycle: readiness.cycle,
    gi,
    timestamp: readiness.updatedAt,
    reserve: {
      inProgressBalance: readiness.reserve.inProgressBalance,
      trancheTarget: readiness.reserve.trancheTarget,
      sealedReserveTotal: readiness.reserve.sealedReserveTotal,
      trancheStatus: readiness.reserve.trancheStatus,
    },
    sustain: {
      consecutiveEligibleCycles: readiness.sustain.consecutiveEligibleCycles,
      requiredCycles: readiness.sustain.requiredCycles,
      status: readiness.sustain.status,
    },
    replay: { ...readiness.replay },
    novelty: { ...readiness.novelty },
    quorum: {
      required: readiness.quorum.required,
      attested: readiness.quorum.attested,
      status: readiness.quorum.status,
    },
  };
}
