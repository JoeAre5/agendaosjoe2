export function SkeletonCard() {
  return (
    <div
      className="rounded-2xl overflow-hidden animate-pulse"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
    >
      <div className="aspect-video" style={{ background: "var(--bg-surface-2)" }} />
      <div className="p-4 space-y-2">
        <div className="h-2 w-16 rounded" style={{ background: "var(--bg-surface-2)" }} />
        <div className="h-3 w-3/4 rounded" style={{ background: "var(--bg-surface-2)" }} />
        <div className="h-2 w-full rounded" style={{ background: "var(--bg-surface-2)" }} />
      </div>
    </div>
  );
}

export function SkeletonServiceRow() {
  return (
    <div
      className="flex items-center justify-between px-4 py-4 rounded-xl animate-pulse"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
    >
      <div className="space-y-2 flex-1">
        <div className="h-3 w-40 rounded" style={{ background: "var(--bg-surface-2)" }} />
        <div className="h-2 w-20 rounded" style={{ background: "var(--bg-surface-2)" }} />
      </div>
      <div className="h-3 w-10 rounded" style={{ background: "var(--bg-surface-2)" }} />
    </div>
  );
}

export function SkeletonBarberCard() {
  return (
    <div className="flex flex-col animate-pulse">
      <div
        className="aspect-[3/4] rounded-2xl"
        style={{ background: "var(--bg-surface-2)" }}
      />
      <div className="mt-3 space-y-2">
        <div className="h-3 w-24 rounded" style={{ background: "var(--bg-surface-2)" }} />
        <div className="h-2 w-16 rounded" style={{ background: "var(--bg-surface-2)" }} />
      </div>
    </div>
  );
}
