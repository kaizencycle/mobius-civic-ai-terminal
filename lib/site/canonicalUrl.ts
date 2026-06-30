/** Canonical public origin — never use VERCEL_URL or preview deployment hosts. */
export const CANONICAL_TERMINAL_ORIGIN =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ||
  process.env.NEXT_PUBLIC_CANONICAL_URL?.replace(/\/$/, '') ||
  'https://terminal.mobius-substrate.com';
