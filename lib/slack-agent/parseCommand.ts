import type { ParsedSlackCommand, SlackAgentCommandName } from '@/lib/slack-agent/types';

const NAMES: SlackAgentCommandName[] = [
  'status',
  'vault',
  'cycle',
  'pulse',
  'readiness',
  'journal',
  'quest',
  'propose',
  'draft-pr',
  'run',
];

function stripMention(text: string): string {
  return text.replace(/^<@[A-Z0-9]+>\s*/i, '').trim();
}

export function parseSlackCommandText(text: string): ParsedSlackCommand | { error: string } {
  const raw = stripMention(text).replace(/^\/?mobius\s+/i, '').trim();
  if (!raw) return { error: 'empty_command' };

  const lower = raw.toLowerCase();
  for (const name of NAMES) {
    if (lower === name || lower.startsWith(`${name} `)) {
      const rest = raw.slice(name.length).trim();
      return { name, args: rest, raw };
    }
  }
  return { error: `unknown_command:${raw.split(/\s+/)[0] ?? ''}` };
}
