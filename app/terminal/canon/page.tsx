// only showing modified OperatorControls section

function OperatorControls({ block }: { block: CanonReserveBlockView }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [result, setResult] = useState<OperatorActionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runAction(label: string, endpoint: string, init?: RequestInit) {
    setOpen(true);
    setLoading(label);
    setError(null);
    try {
      const response = await fetch(endpoint, { cache: 'no-store', ...init });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? `${label} failed`);
      setResult({ label, endpoint, timestamp: new Date().toISOString(), payload });
    } catch (err) {
      setError(err instanceof Error ? err.message : `${label} failed`);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="mt-4 rounded border border-violet-500/20 bg-violet-950/10 p-3 text-[10px] text-slate-400">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="uppercase tracking-[0.18em] text-violet-300/80">Operator Controls</div>
          <div className="mt-1 text-slate-500">Read-only replay inspection. No promotion, mutation, MIC, Fountain, or Vault writes.</div>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded border border-slate-700 px-2 py-1 uppercase tracking-[0.14em] text-slate-300 hover:border-violet-500/50 hover:text-violet-200"
        >
          {open ? 'hide' : 'inspect'}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => runAction('Replay Plan', '/api/system/replay/plan')} disabled={Boolean(loading)} className="rounded border border-cyan-600/40 px-2 py-1 text-cyan-200">Replay Plan</button>
        <button type="button" onClick={() => runAction('Dry Run', '/api/system/replay/dry-run', { method: 'POST' })} disabled={Boolean(loading)} className="rounded border border-cyan-600/40 px-2 py-1 text-cyan-200">Dry Run</button>
        <button type="button" onClick={() => runAction('Quorum', `/api/system/replay/quorum?seal_id=${encodeURIComponent(block.seal_id)}`)} disabled={Boolean(loading)} className="rounded border border-amber-600/40 px-2 py-1 text-amber-200">Quorum</button>
        <button type="button" onClick={() => runAction('Mutation Layer', `/api/system/replay/mutation?seal_id=${encodeURIComponent(block.seal_id)}`)} disabled={Boolean(loading)} className="rounded border border-violet-600/40 px-2 py-1 text-violet-200">Mutation Layer</button>
        <button type="button" onClick={() => runAction('Council Packet', `/api/system/replay/council-packet?seal_id=${encodeURIComponent(block.seal_id)}`)} disabled={Boolean(loading)} className="rounded border border-emerald-600/40 px-2 py-1 text-emerald-200">Council Packet</button>
      </div>

      {open && (
        <div className="mt-3 rounded border border-slate-800 bg-slate-950/60 p-2">
          <div>seal_id: <span className="text-cyan-100">{block.seal_id}</span></div>
          <div>selected_action: <span className={loading ? 'text-amber-300' : 'text-slate-300'}>{loading ?? result?.label ?? 'none'}</span></div>
          {error && <div className="mt-2 text-rose-200">{error}</div>}
          {result && (
            <pre className="mt-2 max-h-64 overflow-auto text-[10px]">
              {JSON.stringify(result.payload, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
