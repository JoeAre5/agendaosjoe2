export const MAIN_HOME_CARDS = ["profit", "expenses", "retention", "production", "payroll", "appointments"] as const;
export const DETAIL_HOME_CARDS = ["payments", "ranking", "services"] as const;
export type HomeCardId = typeof MAIN_HOME_CARDS[number] | typeof DETAIL_HOME_CARDS[number];
export type HomeCardLayout = { main: HomeCardId[]; details: HomeCardId[] };

export function normalizeHomeCardLayout(value: unknown): HomeCardLayout {
  const result: HomeCardLayout = { main: [], details: [] };
  const known = new Set<string>([...MAIN_HOME_CARDS, ...DETAIL_HOME_CARDS]);
  const seen = new Set<string>();
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  for (const section of ["main", "details"] as const) {
    const entries = Array.isArray(source[section]) ? source[section] : [];
    for (const id of entries) {
      if (typeof id === "string" && known.has(id) && !seen.has(id)) {
        result[section].push(id as HomeCardId);
        seen.add(id);
      }
    }
  }
  for (const [section, defaults] of [["main", MAIN_HOME_CARDS], ["details", DETAIL_HOME_CARDS]] as const) {
    for (const id of defaults) if (!seen.has(id)) result[section].push(id);
  }
  return result;
}

export function moveHomeCard(layout: HomeCardLayout, id: HomeCardId, target: "main" | "details"): HomeCardLayout {
  if (!layout.main.includes(id) && !layout.details.includes(id)) return layout;
  return {
    main: [...layout.main.filter(item => item !== id), ...(target === "main" ? [id] : [])],
    details: [...layout.details.filter(item => item !== id), ...(target === "details" ? [id] : [])],
  };
}

export function reorderHomeCard(layout: HomeCardLayout, active: HomeCardId, over: HomeCardId): HomeCardLayout {
  const section = layout.main.includes(active) ? "main" : "details";
  const items = [...layout[section]];
  const from = items.indexOf(active);
  const to = items.indexOf(over);
  if (from < 0 || to < 0 || from === to) return layout;
  items.splice(to, 0, ...items.splice(from, 1));
  return { ...layout, [section]: items };
}

export const homeLayoutKey = (userId: string) => `agendaos.admin-home-layout.v1.${userId}`;
export function readHomeCardLayout(userId: string): HomeCardLayout {
  try { return normalizeHomeCardLayout(JSON.parse(localStorage.getItem(homeLayoutKey(userId)) || "null")); }
  catch { return normalizeHomeCardLayout(null); }
}
export function saveHomeCardLayout(userId: string, layout: HomeCardLayout): boolean {
  try { localStorage.setItem(homeLayoutKey(userId), JSON.stringify(normalizeHomeCardLayout(layout))); return true; }
  catch { return false; }
}