export type TerminalCommandName =
  | 'weekly_digest'
  | 'gi_status'
  | 'agent_status';

export type TerminalCommandResult = {
  command: TerminalCommandName | string;
  ok: boolean;
  title: string;
  summary?: string;
  data?: unknown;
  error?: string;
  timestamp: string;
};

export type TerminalCommandDefinition = {
  name: TerminalCommandName;
  description: string;
};
