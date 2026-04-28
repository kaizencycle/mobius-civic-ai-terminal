import { readReplayMutationReceipt } from '@/lib/system/replay-promotion';
import { buildReplaySnapshotResponse, evaluateReplayQuorum, readReplayCouncil } from '@/lib/system/replay-quorum';

export const REPLAY_COUNCIL_PACKET_VERSION = 'C-294.phase11.step6.v1' as const;

export type ReplayCouncilPacket = {
  version: typeof REPLAY_COUNCIL_PACKET_VERSION;
  seal_id: string;
  replay_snapshot_hash: string;
  status: 'ready_for_council' | 'awaiting_messages' | 'approved_candidate' | 'blocked' | 'contested' | 'receipt_recorded';
  council_summary: {
    message_count: number;
    agents_present: string[];
    missing_agents: string[];
    approved_count: number;
    flagged_count: number;
    abstained_count: number;
    quorum_status: string;
    quorum_reached: boolean;
    quorum_hash: string | null;
  };
  replay_summary: {
    cycle_at_seal: string;
    gi_at_seal: number;
    mode_at_seal: string;
    original_status: string;
    source_entries: number;
    deposit_hashes_count: number;
  };
  mutation_summary: {
    receipt_present: boolean;
    receipt_hash: string | null;
    mutation_status: string | null;
    effective_interpretation: 'original' | 'recovered_view';
  };
  prompts_for_agents: string[];
  readonly: true;
  canon: string[];
};

export type ReplayCouncilPacketResponse = {
  ok: true;
  readonly: true;
  packet: ReplayCouncilPacket;
};

export type ReplayCouncilPacketError = {
  ok: false;
  readonly: true;
  error: 'missing_seal_id' | 'seal_not_found' | 'packet_failed';
};

function packetStatus(args: {
  messageCount: number;
  quorumStatus: string;
  receiptPresent: boolean;
}): ReplayCouncilPacket['status'] {
  if (args.receiptPresent) return 'receipt_recorded';
  if (args.quorumStatus === 'approved') return 'approved_candidate';
  if (args.quorumStatus === 'blocked') return 'blocked';
  if (args.quorumStatus === 'contested') return 'contested';
  if (args.messageCount > 0) return 'awaiting_messages';
  return 'ready_for_council';
}

export async function buildReplayCouncilPacket(sealId: string | null): Promise<ReplayCouncilPacketResponse | ReplayCouncilPacketError> {
  if (!sealId) return { ok: false, readonly: true, error: 'missing_seal_id' };

  const snapshot = await buildReplaySnapshotResponse(sealId);
  if (!snapshot.ok) return { ok: false, readonly: true, error: snapshot.error };

  const [council, quorum, receipt] = await Promise.all([
    readReplayCouncil(sealId),
    evaluateReplayQuorum(sealId),
    readReplayMutationReceipt(sealId),
  ]);

  if (!council.ok || !quorum.ok) return { ok: false, readonly: true, error: 'packet_failed' };

  const receiptPresent = receipt.ok;
  const status = packetStatus({
    messageCount: council.record.message_count,
    quorumStatus: quorum.evaluation.status,
    receiptPresent,
  });

  return {
    ok: true,
    readonly: true,
    packet: {
      version: REPLAY_COUNCIL_PACKET_VERSION,
      seal_id: sealId,
      replay_snapshot_hash: snapshot.snapshot.replay_snapshot_hash,
      status,
      council_summary: {
        message_count: council.record.message_count,
        agents_present: council.record.agents_present,
        missing_agents: council.record.missing_agents,
        approved_count: quorum.evaluation.approved_count,
        flagged_count: quorum.evaluation.flagged_count,
        abstained_count: quorum.evaluation.abstained_count,
        quorum_status: quorum.evaluation.status,
        quorum_reached: quorum.evaluation.quorum_reached,
        quorum_hash: quorum.evaluation.quorum_hash,
      },
      replay_summary: {
        cycle_at_seal: snapshot.snapshot.cycle_at_seal,
        gi_at_seal: snapshot.snapshot.gi_at_seal,
        mode_at_seal: snapshot.snapshot.mode_at_seal,
        original_status: snapshot.snapshot.status_at_replay,
        source_entries: snapshot.snapshot.source_entries,
        deposit_hashes_count: snapshot.snapshot.deposit_hashes_count,
      },
      mutation_summary: {
        receipt_present: receiptPresent,
        receipt_hash: receipt.ok ? receipt.receipt.receipt_hash : null,
        mutation_status: receipt.ok ? receipt.receipt.status : null,
        effective_interpretation: receiptPresent ? 'recovered_view' : 'original',
      },
      prompts_for_agents: [
        'Review the replay_snapshot_hash, not current hot state.',
        'Compare original seal status with effective interpretation before voting.',
        'Do not treat replay quorum as original-time attestation.',
        'Preserve original failure history while evaluating correction context.',
      ],
      readonly: true,
      canon: [
        'Replay Council Packet is read-only and does not submit agent messages.',
        'Packet summarizes snapshot, council, quorum, and mutation receipt state for agent awareness.',
        'No Vault mutation, MIC/Fountain unlock, rollback, or Canon rewrite occurs here.',
      ],
    },
  };
}
