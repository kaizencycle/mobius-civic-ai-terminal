import type { TerminalCommandDefinition, TerminalCommandName } from './types';

export const commandRegistry: TerminalCommandDefinition[] = [
  {
    name: 'weekly_digest',
    description: 'Generate the Mobius weekly global situation digest.',
  },
  {
    name: 'gi_status',
    description: 'Return current Global Integrity system state.',
  },
  {
    name: 'agent_status',
    description: 'Return current Mobius agent status grid data.',
  },
];

export const commandRegistryByName: Record<TerminalCommandName, TerminalCommandDefinition> =
  commandRegistry.reduce((acc, command) => {
    acc[command.name] = command;
    return acc;
  }, {} as Record<TerminalCommandName, TerminalCommandDefinition>);
