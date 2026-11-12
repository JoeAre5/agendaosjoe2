import { useTranslation } from "@/hooks/useTranslation";

export interface BlogCategory {
  slug: string;
  label_es: string;
  label_en: string;
}

interface Props {
  categories: BlogCategory[];
  active: string;
  onChange: (slug: string) => void;
}

export function CategoryPills({ categories, active, onChange }: Props) {
  const { language } = useTranslation();
  const all = [{ slug: "all", label_es: "Todas", label_en: "All" }, ...categories];

  return (
    <div className="sticky top-[60px] z-20 -mx-5 px-5 py-3 mb-8 backdrop-blur"
      style={{
        background: "color-mix(in srgb, var(--bg-base) 85%, transparent)",
        borderBottom: "1px solid var(--divider)",
      }}>
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {all.map((c) => {
          const isActive = active === c.slug;
          return (
            <button
              key={c.slug}
              onClick={() => onChange(c.slug)}
              className="px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-200 active:scale-95"
              style={{
                background: isActive ? "var(--cta-bg)" : "var(--bg-surface-2)",
                color: isActive ? "var(--cta-fg)" : "var(--text-secondary)",
                border: isActive ? "1px solid var(--cta-bg)" : "1px solid var(--divider)",
              }}
            >
              {language === "es" ? c.label_es : c.label_en}
            </button>
          );
        })}
      </div>
    </div>
  );
}
