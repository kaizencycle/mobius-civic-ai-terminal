import { agentStatus } from '@/lib/mock/agentStatus';
import { integrityStatus } from '@/lib/mock/integrityStatus';
import { buildWeeklyDigest } from '@/lib/digest/weekly';
import { commandRegistryByName } from './registry';
import type { TerminalCommandName, TerminalCommandResult } from './types';

function isTerminalCommandName(value: string): value is TerminalCommandName {
  return value in commandRegistryByName;
}

export async function runTerminalCommand(
  rawInput: string,
): Promise<TerminalCommandResult> {
  const input = rawInput.trim();

  if (!input) {
    return {
      command: input,
      ok: false,
      title: 'Command Required',
      error: 'Enter a command to execute.',
      timestamp: new Date().toISOString(),
    };
  }

  if (!isTerminalCommandName(input)) {
    return {
      command: input,
      ok: false,
      title: 'Unknown Command',
      error: `Command not recognized: ${input}`,
      timestamp: new Date().toISOString(),
    };
  }

  switch (input) {
    case 'weekly_digest': {
      const digest = buildWeeklyDigest();
      return {
        command: input,
        ok: true,
        title: 'Mobius Weekly Situation Digest',
        summary: digest.summary,
        data: digest,
        timestamp: new Date().toISOString(),
      };
    }
    case 'gi_status':
      return {
        command: input,
        ok: true,
        title: 'Global Integrity Status',
        summary: integrityStatus.summary,
        data: integrityStatus,
        timestamp: new Date().toISOString(),
      };
    case 'agent_status':
      return {
        command: input,
        ok: true,
        title: 'Mobius Agent Status',
        summary: 'Canonical agent role and state surface.',
        data: agentStatus,
        timestamp: new Date().toISOString(),
      };
  }
}
