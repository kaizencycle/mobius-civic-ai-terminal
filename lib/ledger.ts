/**
 * C-314 / FIX-03: Terminal identity fields for Civic Protocol ledger payloads.
 * Spread into outbound bodies so Render never returns "No API base configured for terminal".
 * Uses getters so reads follow env changes after module load (same contract as getTerminalRegistration).
 */
export const TERMINAL_REGISTRATION = {
  get terminal_id(): string {
    return process.env.TERMINAL_ID?.trim() || 'mobius-civic-ai-terminal';
  },
  get api_base(): string {
    const raw =
      process.env.TERMINAL_API_BASE?.trim() ||
      process.env.NEXT_PUBLIC_TERMINAL_URL?.trim() ||
      process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
      'https://mobius-civic-ai-terminal.vercel.app';
    return raw.replace(/\/+$/, '');
  },
};
