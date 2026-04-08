'use client';

type ChamberSkeletonProps = {
  blocks?: number;
};

export default function ChamberSkeleton({ blocks = 6 }: ChamberSkeletonProps) {
  return (
    <div className="h-full w-full animate-pulse p-4">
      <div className="mb-4 h-10 w-1/3 rounded-md bg-slate-800/70" />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: blocks }).map((_, idx) => (
          <div key={idx} className="h-28 rounded-md border border-slate-800 bg-slate-900/70" />
        ))}
      </div>
    </div>
  );
}
