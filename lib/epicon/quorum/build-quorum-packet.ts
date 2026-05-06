import crypto from 'node:crypto';

import type { EpiconGovernanceReceipt } from '../runtime/types';
import { buildEscalationPreview } from './escalation-router';
import type { EpiconQuorumPacket } from './types';

function buildPacketId(receipt: EpiconGovernanceReceipt): string {
  return crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        repo: receipt.event.repo,
        prNumber: receipt.event.prNumber,
        fingerprint: receipt.replayFingerprint,
      }),
    )
    .digest('hex');
}

export function buildQuorumPacket(
  receipt: EpiconGovernanceReceipt,
): EpiconQuorumPacket {
  const escalation = buildEscalationPreview(receipt);

  return {
    packetId: buildPacketId(receipt),
    tier: escalation.tier,
    receipt,
    reasons: escalation.reasons,
    requestedAgents: escalation.requestedAgents,
    createdAt: new Date().toISOString(),
    enforcement: 'disabled',
  };
}
