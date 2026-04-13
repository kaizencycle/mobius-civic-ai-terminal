'use client';

/**
 * Catches client-side exceptions in the terminal tree (mobile Safari / hydration edge cases).
 */
export default function TerminalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 bg-[#020617] px-4 py-12 text-center text-slate-200">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-rose-400">Terminal runtime error</p>
      <p className="max-w-md text-sm text-slate-400">
        {error.message || 'A client-side exception occurred. This is often a browser-specific rendering issue.'}
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="rounded border border-cyan-500/40 bg-cyan-500/10 px-4 py-2 font-mono text-xs text-cyan-200 hover:bg-cyan-500/20"
      >
        Retry
      </button>
    </div>
  );
}
