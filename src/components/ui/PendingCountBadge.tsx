import { cn } from "@/lib/utils";

interface Props {
  count: number | null;
  label: string;
  className?: string;
}

/** Matches the payment badge, using shared semantic notification colors. */
export function PendingCountBadge({ count, label, className }: Props) {
  if (count == null || count <= 0) return null;
  return (
    <span
      aria-label={`${label}: ${count}`}
      className={cn("inline-flex shrink-0 items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[11px] font-bold bg-[var(--pending-badge-bg)] text-[var(--pending-badge-fg)]", className)}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}