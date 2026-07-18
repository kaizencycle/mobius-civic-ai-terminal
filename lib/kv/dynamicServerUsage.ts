/**
 * Next.js static generation throws DynamicServerError to mark routes dynamic.
 * The mobius-kv layer must rethrow without logging — not a KV failure.
 * C-375 Lane 6 / docs/LOGGING.md build-time witness.
 */

export function isNextDynamicServerUsageError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const rec = err as { digest?: string; message?: string };
  if (rec.digest === 'DYNAMIC_SERVER_USAGE') return true;
  const msg = rec.message;
  return typeof msg === 'string' && msg.includes('Dynamic server usage');
}

/** Rethrow Next.js dynamic-route control-flow; callers should not log these as KV errors. */
export function rethrowIfDynamicServerUsage(err: unknown): never | void {
  if (isNextDynamicServerUsageError(err)) {
    throw err;
  }
}
