export default function SectionLabel({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        <div className="text-xs font-mono uppercase tracking-[0.24em] text-slate-400">
          {title}
        </div>
        <div className="mt-1 text-sm font-sans text-slate-500">{subtitle}</div>
      </div>
    </div>
  );
}
