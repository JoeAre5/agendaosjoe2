import { User, Check } from "lucide-react";

const BARBER_COLORS: Record<string, string> = {
  charlie: "#c9a882",
  pito: "#8aaec9",
  joseph: "#7ab893",
};

export function getBarberColor(name: string): string {
  const lower = name.toLowerCase();
  for (const [key, color] of Object.entries(BARBER_COLORS)) {
    if (lower.includes(key)) return color;
  }
  return "var(--accent-color)";
}

interface BarberPickerRowProps {
  name: string;
  avatarUrl: string | null;
  isSelected: boolean;
  subtitle?: string;
  selectLabel?: string;
  onClick: () => void;
}

export function BarberPickerRow({
  name,
  avatarUrl,
  isSelected,
  subtitle = "Barbero",
  selectLabel = "Elegir",
  onClick,
}: BarberPickerRowProps) {
  const bColor = getBarberColor(name);

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-4 px-1 py-4 transition-all"
    >
      {avatarUrl ? (
        <img
          src={`${avatarUrl}${avatarUrl.includes("?") ? "&" : "?"}width=96&height=96&resize=cover&quality=70`}
          alt={name}
          className="w-12 h-12 rounded-full object-cover shrink-0"
          style={{ boxShadow: "0 4px 16px rgba(0,0,0,0.18)", background: "var(--bg-surface-2)" }}
          loading="eager"
          decoding="sync"
          fetchPriority="high"
        />
      ) : (
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
          style={{
            background: `${bColor}20`,
            boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
          }}
        >
          <User size={22} style={{ color: bColor }} />
        </div>
      )}
      <div className="flex-1 text-left min-w-0">
        <p
          className="text-[15px] font-bold"
          style={{ color: "var(--text-primary)" }}
        >
          {name}
        </p>
        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
          {subtitle}
        </p>
      </div>
      {isSelected ? (
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
          style={{ background: bColor }}
        >
          <Check className="icon-extrabold" size={16} color="#fff" />
        </div>
      ) : (
        <span
          className="text-xs font-medium px-4 py-1.5 rounded-full shrink-0"
          style={{
            border: "1.5px solid var(--border)",
            color: "var(--text-secondary)",
          }}
        >
          {selectLabel}
        </span>
      )}
    </button>
  );
}
