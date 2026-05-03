import type { NextApiRequest, NextApiResponse } from 'next';
import { computeConsensus } from '@/lib/epicon/consensus';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { reports } = req.body || {};

    if (!reports || !Array.isArray(reports)) {
      return res.status(400).json({ error: 'invalid_reports' });
    }

    const consensus = computeConsensus(reports);

    return res.status(200).json({
      status: consensus.status,
      ecs: consensus.ecs,
      vote: consensus.vote,
      quorum: consensus.quorum,
      dissent: consensus.dissent_set,
    });
  } catch (err) {
    return res.status(500).json({ error: 'epicon_check_failed' });
  }
}
