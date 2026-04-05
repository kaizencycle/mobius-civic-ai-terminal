import { agentStatus } from '@/lib/mock/agentStatus';
import { integrityStatus } from '@/lib/mock/integrityStatus';
import { buildWeeklyDigest } from '@/lib/digest/weekly';
import {
  getLabLaunchUrl,
  getSubstrateStatusSummary,
  type LabId,
} from '@/lib/substrate/client';
import { commandRegistryByName } from './registry';
import type { TerminalCommandName, TerminalCommandResult } from './types';

function isTerminalCommandName(value: string): value is TerminalCommandName {
  return value in commandRegistryByName;
}

export async function runTerminalCommand(
  rawInput: string,
): Promise<TerminalCommandResult> {
  const input = rawInput.trim();
  const [commandName, ...argParts] = input.split(/\s+/);
  const args = argParts.join(' ').trim();

  if (!input) {
    return {
      command: input,
      ok: false,
      title: 'Command Required',
      error: 'Enter a command to execute.',
      timestamp: new Date().toISOString(),
    };
  }

  if (!isTerminalCommandName(commandName)) {
    return {
      command: input,
      ok: false,
      title: 'Unknown Command',
      error: `Command not recognized: ${commandName}`,
      timestamp: new Date().toISOString(),
    };
  }

  switch (commandName) {
    case 'weekly_digest': {
      const digest = buildWeeklyDigest();
      return {
        command: commandName,
        ok: true,
        title: 'Mobius Weekly Situation Digest',
        summary: digest.summary,
        data: digest,
        timestamp: new Date().toISOString(),
      };
    }
    case 'gi_status':
      return {
        command: commandName,
        ok: true,
        title: 'Global Integrity Status',
        summary: integrityStatus.summary,
        data: integrityStatus,
        timestamp: new Date().toISOString(),
      };
    case 'agent_status':
      return {
        command: commandName,
        ok: true,
        title: 'Mobius Agent Status',
        summary: 'Canonical agent role and state surface.',
        data: agentStatus,
        timestamp: new Date().toISOString(),
      };
    case 'substrate_status': {
      const summary = await getSubstrateStatusSummary();
      const healthy = summary.services.filter((service) => service.ok).length;
      return {
        command: commandName,
        ok: true,
        title: 'Mobius Substrate Service Status',
        summary: `${healthy}/${summary.services.length} services healthy`,
        data: summary,
        timestamp: new Date().toISOString(),
      };
    }
    case 'open_lab': {
      const target = args.toLowerCase();
      const supported: LabId[] = ['oaa', 'reflections', 'shield', 'hive', 'jade'];
      if (!supported.includes(target as LabId)) {
        return {
          command: commandName,
          ok: false,
          title: 'Lab Target Required',
          error: `Usage: open_lab <${supported.join('|')}>`,
          timestamp: new Date().toISOString(),
        };
      }

      const url = getLabLaunchUrl(target as LabId);
      return {
        command: commandName,
        ok: true,
        title: `Shell Lab URL (${target})`,
        summary: 'Resolved Browser Shell lab endpoint.',
        data: { lab: target, url },
        timestamp: new Date().toISOString(),
      };
    }
  }
}
