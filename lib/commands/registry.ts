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
  {
    name: 'substrate_status',
    description: 'Probe Mobius Substrate services (ledger, GI, MIC, broker, OAA).',
  },
  {
    name: 'open_lab',
    description: 'Resolve Browser Shell lab URL. Usage: open_lab <oaa|reflections|shield|hive|jade>',
  },
];

export const commandRegistryByName: Record<TerminalCommandName, TerminalCommandDefinition> =
  commandRegistry.reduce((acc, command) => {
    acc[command.name] = command;
    return acc;
  }, {} as Record<TerminalCommandName, TerminalCommandDefinition>);
