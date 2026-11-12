/**
 * backToCalendar — preserves the ?date param when navigating back from
 * detail/edit/new pages to /admin?tab=calendar. Fallback when no date
 * context is present is the bare /admin?tab=calendar (today).
 *
 * Usage:
 *   const navigate = useNavigate();
 *   const [searchParams] = useSearchParams();
 *   navigate(backToCalendar(searchParams));
 */
import type { URLSearchParams as URLSearchParamsType } from "url";

type SearchParamsLike = { get(name: string): string | null };

export function backToCalendar(searchParams?: SearchParamsLike | null): string {
  const date = searchParams?.get("date");
  const params = new URLSearchParams({ tab: "calendar" });
  if (date) params.set("date", date);
  return `/admin?${params.toString()}`;
}

/** Same idea for menu sub-pages (Cuadre/Nómina) returning to /admin?tab=menu */
export function backToMenu(searchParams?: SearchParamsLike | null): string {
  const week = searchParams?.get("week");
  const params = new URLSearchParams({ tab: "menu" });
  // Week stays in its own URL; menu doesn't need it. Keeping simple.
  return `/admin?${params.toString()}`;
}
