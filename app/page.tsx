import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
      <div className="max-w-2xl text-center">
        <div className="text-sm font-mono uppercase tracking-[0.3em] text-sky-300">
          Mobius Civic AI Terminal
        </div>
        <h1 className="mt-4 text-4xl font-sans font-semibold">
          Civic intelligence. Auditable signals. Integrity in motion.
        </h1>
        <p className="mt-4 font-sans text-slate-400">
          A civic Bloomberg-style command interface for Mobius Substrate.
        </p>
        <Link
          href="/terminal"
          className="mt-8 inline-block rounded-lg border border-sky-500/30 bg-sky-500/10 px-5 py-3 text-sm font-mono text-sky-300 hover:bg-sky-500/20 transition"
        >
          Open Terminal
        </Link>
      </div>
    </main>
  );
}
