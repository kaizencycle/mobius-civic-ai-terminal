import { EpiconAgentReport, EpiconConsensus } from './types';

export function computeConsensus(reports: EpiconAgentReport[]): EpiconConsensus {
  const total = reports.length;
  const support = reports.filter(r => r.stance === 'support').length;
  const conditional = reports.filter(r => r.stance === 'conditional').length;
  const oppose = reports.filter(r => r.stance === 'oppose').length;

  const ecs = total === 0 ? 0 : (support + 0.5 * conditional) / total;

  let status: EpiconConsensus['status'] = 'fail';
  if (ecs >= 0.8 && oppose === 0) status = 'pass';
  else if (ecs >= 0.6) status = 'needs_clarification';

  return {
    status,
    ecs,
    vote: { support, conditional, oppose },
    quorum: {
      agents: total,
      min_required: 5,
      independent_ok: total >= 5,
    },
    dissent_set: reports
      .filter(r => r.stance !== 'support')
      .map(r => ({ agent: r.agent, stance: r.stance, reason: r.ej.reasoning })),
    required_questions: status === 'needs_clarification'
      ? ['Clarify EJ anchors', 'Resolve dissent']
      : [],
  };
}
