import type { MicReadinessResponse } from '@/lib/mic/types';

/**
 * Merge Substrate-posted MIC_READINESS_V1 over locally assembled readiness.
 * Incoming fields override when present; local fills gaps.
 */
export function mergeMicReadinessFromUpstream(
  local: MicReadinessResponse,
  incoming: Partial<MicReadinessResponse> | null,
): MicReadinessResponse {
  if (!incoming || typeof incoming !== 'object') return local;

  return {
    ...local,
    ...(incoming.cycle !== undefined && incoming.cycle !== '' ? { cycle: incoming.cycle } : {}),
    ...(typeof incoming.gi === 'number' && Number.isFinite(incoming.gi) ? { gi: incoming.gi } : {}),
    ...(incoming.mintThresholdGi !== undefined ? { mintThresholdGi: incoming.mintThresholdGi } : {}),
    // C-286: `in_progress_balance` is canonical from this Terminal's Vault KV — never override from upstream proxy.
    reserve: incoming.reserve
      ? {
          ...local.reserve,
          ...incoming.reserve,
          inProgressBalance: local.reserve.inProgressBalance,
        }
      : local.reserve,
    sustain: incoming.sustain ? { ...local.sustain, ...incoming.sustain } : local.sustain,
    replay: incoming.replay ? { ...local.replay, ...incoming.replay } : local.replay,
    novelty: incoming.novelty ? { ...local.novelty, ...incoming.novelty } : local.novelty,
    quorum: incoming.quorum ? { ...local.quorum, ...incoming.quorum } : local.quorum,
    fountain: incoming.fountain ? { ...local.fountain, ...incoming.fountain } : local.fountain,
    ...(incoming.mintReadiness !== undefined ? { mintReadiness: incoming.mintReadiness } : {}),
    vault: incoming.vault ? { ...local.vault, ...incoming.vault } : local.vault,
    ...(incoming.updatedAt !== undefined ? { updatedAt: incoming.updatedAt } : {}),
    readiness_proof: incoming.readiness_proof?.hash ? incoming.readiness_proof : local.readiness_proof,
    schema: 'MIC_READINESS_V1',
  };
}
