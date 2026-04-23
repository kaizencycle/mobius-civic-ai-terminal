import {
  creditMic,
  getMicAccount,
  getStakeLock,
  settleStakeLock,
} from './store';

export type SettlementOutcome = 'verified' | 'inconclusive' | 'contradicted';

export function settleEpiconClaim(input: {
  epicon_id: string;
  outcome: SettlementOutcome;
}) {
  const lock = getStakeLock(input.epicon_id);

  if (!lock) {
    throw new Error('No stake lock found for EPICON');
  }

  if (lock.status === 'settled') {
    throw new Error('Stake lock already settled');
  }

  const login = lock.login;
  const stake = lock.stake;

  let returned_stake = 0;
  let reward = 0;
  let burned = 0;

  if (input.outcome === 'verified') {
    returned_stake = stake;
    reward = 3;
    creditMic(login, returned_stake + reward);
  } else if (input.outcome === 'inconclusive') {
    returned_stake = stake;
    creditMic(login, returned_stake);
  } else if (input.outcome === 'contradicted') {
    burned = stake;
  }

  settleStakeLock(input.epicon_id);

  return {
    epicon_id: input.epicon_id,
    login,
    outcome: input.outcome,
    returned_stake,
    reward,
    burned,
    balance: getMicAccount(login).balance,
    settled_at: new Date().toISOString(),
  };
}
