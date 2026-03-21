export type MicAccount = {
  login: string;
  balance: number;
};

export type StakeLock = {
  epicon_id: string;
  login: string;
  stake: number;
  status: 'locked' | 'settled';
  created_at: string;
};

const balances = new Map<string, MicAccount>();
const stakeLocks = new Map<string, StakeLock>();

export function ensureMicAccount(login: string) {
  if (!balances.has(login)) {
    balances.set(login, {
      login,
      balance: 100,
    });
  }

  return balances.get(login)!;
}

export function getMicAccount(login: string) {
  return ensureMicAccount(login);
}

export function lockStake(input: {
  epicon_id: string;
  login: string;
  stake: number;
}) {
  const account = ensureMicAccount(input.login);

  if (input.stake > account.balance) {
    throw new Error('Insufficient MIC balance');
  }

  account.balance -= input.stake;

  const lock: StakeLock = {
    epicon_id: input.epicon_id,
    login: input.login,
    stake: input.stake,
    status: 'locked',
    created_at: new Date().toISOString(),
  };

  stakeLocks.set(input.epicon_id, lock);
  return lock;
}

export function getStakeLock(epicon_id: string) {
  return stakeLocks.get(epicon_id) || null;
}

export function settleStakeLock(epicon_id: string) {
  const lock = stakeLocks.get(epicon_id);
  if (!lock) {
    return null;
  }

  lock.status = 'settled';
  return lock;
}

export function creditMic(login: string, amount: number) {
  const account = ensureMicAccount(login);
  account.balance += amount;
  return account;
}

export function debitMic(login: string, amount: number) {
  const account = ensureMicAccount(login);
  account.balance -= amount;
  return account;
}
