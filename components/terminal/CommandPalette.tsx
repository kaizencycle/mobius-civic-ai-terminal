import SectionLabel from './SectionLabel';

export default function CommandPalette({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <SectionLabel
        title="Command Palette"
        subtitle="Keyboard-first substrate access"
      />
      <div className="mt-3 flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">
        <span className="text-sm font-mono text-slate-500">⌘K</span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Try /scan iran, /market sweep, /ledger C249"
          className="w-full bg-transparent text-sm font-mono text-white outline-none placeholder:text-slate-500"
        />
      </div>
    </section>
  );
}
